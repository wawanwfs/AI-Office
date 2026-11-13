"""Disposable PKI and signer fixture for the real reference mTLS service."""
import base64
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from preview_oci_layout import PLATFORM, sha256
from preview_release_journal import GENESIS, ROUTE, JournalTLS, RemoteReleasePolicy, encode_entry, rotation_checkpoint
from preview_release_policy import checkpoint_message

SERVER = Path(__file__).with_name("wfs_release_journal_server.py").resolve()


class JournalFixture:
    def __init__(self, root, manifest, approval):
        self.root = root
        root.mkdir(mode=0o700)
        self.manifest = manifest
        self.approval = approval
        self.entries = []
        self.hashes = []
        self.signer = Ed25519PrivateKey.generate()
        pub = self.signer.public_key()
        self.fingerprint = sha256(pub.public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw))
        self.policy_key = root / "policy.pem"
        self.policy_key.write_bytes(pub.public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        self.journal = root / "journal.json"
        self._pki()

    def _pki(self):
        now = datetime.now(timezone.utc)
        ca_key = Ed25519PrivateKey.generate()
        ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "WFS disposable journal CA")])

        def certificate(name, key, issuer):
            return (x509.CertificateBuilder().subject_name(name).issuer_name(issuer)
                    .public_key(key.public_key()).serial_number(x509.random_serial_number())
                    .not_valid_before(now - timedelta(minutes=2))
                    .not_valid_after(now + timedelta(hours=1)))

        ca = (certificate(ca_name, ca_key, ca_name)
              .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
              .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),
                             critical=False)
              .add_extension(x509.KeyUsage(False, False, False, False, False,
                                          True, True, None, None), critical=True)
              .sign(ca_key, None))
        (self.root / "ca.pem").write_bytes(ca.public_bytes(serialization.Encoding.PEM))
        for role, purpose in (("server", ExtendedKeyUsageOID.SERVER_AUTH),
                              ("client", ExtendedKeyUsageOID.CLIENT_AUTH),
                              ("unapproved-client", ExtendedKeyUsageOID.CLIENT_AUTH)):
            key = Ed25519PrivateKey.generate()
            name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "WFS " + role)])
            cert = (certificate(name, key, ca_name)
                    .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
                    .add_extension(x509.ExtendedKeyUsage([purpose]), critical=False)
                    .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(
                        ca_key.public_key()), critical=False)
                    .add_extension(x509.SubjectAlternativeName([
                        x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
                    .sign(ca_key, None))
            (self.root / (role + ".pem")).write_bytes(cert.public_bytes(serialization.Encoding.PEM))
            key_path = self.root / (role + "-key.pem")
            key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
            key_path.chmod(0o600)
            setattr(self, role.replace("-", "_") + "_pin",
                    sha256(cert.public_bytes(serialization.Encoding.DER)))

    def append(self, decision="allow", *, now=None):
        if now is None:
            now = int(time.time())
        raw = json.dumps({
            "version": 2, "sequence": len(self.hashes) + 1,
            "previous_sha256": self.hashes[-1] if self.hashes else GENESIS,
            "manifest_digest": self.manifest, "approval_sha256": self.approval,
            "platform": PLATFORM, "decision": decision,
            "issued_at": now, "expires_at": now + 540,
        }, sort_keys=True).encode("ascii")
        self.entries.append(encode_entry(raw, base64.b64encode(
            self.signer.sign(checkpoint_message(raw, chained=True)))))
        self.hashes.append(sha256(raw))
        self.publish(self.entries)
        return len(self.hashes)

    def rotate(self, **changes):
        raw = rotation_checkpoint(self.entries, self.policy_key.read_bytes(), self.fingerprint)
        if changes:
            raw = json.dumps({**json.loads(raw), **changes}, sort_keys=True).encode("ascii")
        self.entries = [self.entries[-1], encode_entry(raw, base64.b64encode(
            self.signer.sign(checkpoint_message(raw, chained=True, rotation=True))))]
        self.hashes.append(sha256(raw))
        self.publish(self.entries)
        return len(self.hashes)

    def publish(self, entries):
        temp = self.journal.with_suffix(".tmp")
        temp.write_text(json.dumps({"entries": entries}), encoding="ascii")
        os.replace(temp, self.journal)

    @contextmanager
    def server(self):
        ready = self.root / "port"
        ready.unlink(missing_ok=True)
        proc = subprocess.Popen([sys.executable, str(SERVER), "--bind", "127.0.0.1",
            "--port", "0", "--cert", str(self.root / "server.pem"),
            "--key", str(self.root / "server-key.pem"), "--client-ca", str(self.root / "ca.pem"),
            "--client-fingerprint", self.client_pin, "--journal", str(self.journal),
            "--policy-key", str(self.policy_key), "--policy-fingerprint", self.fingerprint,
            "--ready", str(ready)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            for _ in range(100):
                if proc.poll() is not None:
                    raise AssertionError(proc.stderr.read().decode(errors="replace")[-2000:])
                if ready.exists() and (port := ready.read_text(encoding="ascii")):
                    yield int(port)
                    return
                time.sleep(.05)
            raise AssertionError("release journal service did not start")
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
            proc.stderr.close()

    def endpoint(self, port, role="client"):
        return JournalTLS(f"https://127.0.0.1:{port}{ROUTE}", self.root / "ca.pem",
                          self.root / (role + ".pem"), self.root / (role + "-key.pem"),
                          self.server_pin)

    def policy(self, port, sequence):
        return RemoteReleasePolicy(self.endpoint(port), self.policy_key, self.fingerprint,
                                   sequence, self.hashes[sequence - 1])
