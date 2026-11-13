"""Synthetic release policy fixture for disposable Linux operator CI only."""
import base64
import json
import time

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from preview_oci_layout import PLATFORM, sha256
from preview_release_policy import SignedReleasePolicy, checkpoint_message


class DisposableReleasePolicySigner:
    def __init__(self, directory, manifest, approval_sha256):
        directory.mkdir(mode=0o700)
        self.directory = directory
        self.manifest = manifest
        self.approval_sha256 = approval_sha256
        self.key = Ed25519PrivateKey.generate()
        public = self.key.public_key()
        self.fingerprint = sha256(public.public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw))
        (directory / "policy.pem").write_bytes(public.public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))

    def issue(self, sequence, *, decision="allow"):
        now = int(time.time())
        raw = json.dumps({
            "version": 1, "sequence": sequence, "decision": decision,
            "manifest_digest": self.manifest, "approval_sha256": self.approval_sha256,
            "platform": PLATFORM, "issued_at": now, "expires_at": now + 540,
        }, sort_keys=True).encode("ascii")
        path = self.directory / f"checkpoint-{sequence}.json"
        sig = path.with_suffix(".sig")
        path.write_bytes(raw)
        sig.write_bytes(base64.b64encode(self.key.sign(checkpoint_message(raw))))
        return SignedReleasePolicy(path, sig, self.directory / "policy.pem",
                                   sha256(raw), self.fingerprint, sequence)
