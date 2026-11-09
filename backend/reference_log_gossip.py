"""Phase 18: pinned HTTPS, independently checked signed-head gossip.

This is a FAIL-CLOSED verifier for two explicitly provisioned HTTPS log
endpoints. Endpoints, CA roots, TLS leaf certificate SHA256, log signer and
archived tree size/root MUST be provisioned out-of-band by the operator.
Never discover approval pins from log responses or AI-generated inputs.

It verifies real TLS hostname/CA/certificate, Ed25519 tree head signatures,
RFC6962 inclusion/consistency and replay/fork/lag across two sources.
It is NOT proof the two endpoints run on independent machines, use WORM
storage, issue authorized receipts, or have externally witnessed freshness.
"""
import base64
import binascii
import hashlib
import hmac
from http.client import HTTPSConnection
import json
from pathlib import Path
import re
import ssl
from urllib.parse import urlsplit

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from preview_admission_v2 import AdmissionDenied
from preview_compact_merkle import verify_compact_proof
from preview_signature import _read_trusted
from preview_transparency import canonical_tree_head

_SHA = re.compile(r"[a-f0-9]{64}\Z")
_HOST = re.compile(r"[A-Za-z0-9.:-]{1,240}\Z")
_EMPTY = hashlib.sha256(b"").hexdigest()


def _sha_valid(value):
    return isinstance(value, str) and _SHA.fullmatch(value) is not None


def _unique(pairs):
    fields = {}
    for key, value in pairs:
        if key in fields:
            raise ValueError("duplicate monitored log response key")
        fields[key] = value
    return fields


def _parse(raw):
    try:
        return json.loads(raw, object_pairs_hook=_unique)
    except (UnicodeError, ValueError, TypeError) as exc:
        raise AdmissionDenied("malformed monitored log response") from exc


def _decode64(value, maximum=4096):
    if not isinstance(value, str) or len(value) > maximum * 2:
        raise AdmissionDenied("monitored log base64 evidence invalid")
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise AdmissionDenied("monitored log base64 evidence invalid") from exc
    if len(raw) > maximum:
        raise AdmissionDenied("monitored log evidence too large")
    return raw


class PinnedHTTPSLogEndpoint:
    """Explicitly configured HTTPS endpoint; never follows redirects."""

    def __init__(self, *, url, bearer, ca_cert_path,
                 trusted_cert_sha256, log_public_key_path,
                 trusted_signer_fingerprint):
        if (not isinstance(url, str) or len(url) > 300 or
                not isinstance(bearer, str) or len(bearer) < 32 or
                not bearer.isascii() or "\r" in bearer or "\n" in bearer):
            raise AdmissionDenied("log endpoint or bearer invalid")
        target = urlsplit(url)
        if (target.scheme != "https" or target.username is not None or
                target.password is not None or target.path not in ("", "/") or
                target.query or target.fragment or target.hostname is None or
                not _HOST.fullmatch(target.hostname) or
                target.hostname.startswith(".") or ".." in target.hostname):
            raise AdmissionDenied("log endpoint must be a pinned HTTPS origin")
        try:
            port = target.port or 443
        except ValueError as exc:
            raise AdmissionDenied("log endpoint TCP port invalid") from exc
        if not 1 <= port <= 65535:
            raise AdmissionDenied("log endpoint TCP port invalid")
        if not _sha_valid(trusted_cert_sha256):
            raise AdmissionDenied("independently pinned TLS certificate required")
        if not _sha_valid(trusted_signer_fingerprint):
            raise AdmissionDenied("independently pinned log signer required")
        # A certificate trust bundle is itself provisioned independently;
        # verify the actual leaf DER SHA256 after a hostname-valid TLS
        # handshake. Nothing is trusted from the HTTPS response body.
        ca = _read_trusted(Path(ca_cert_path), 16384)
        try:
            self.context = ssl.create_default_context(cadata=ca.decode("ascii"))
        except (ssl.SSLError, UnicodeError, ValueError) as exc:
            raise AdmissionDenied("log HTTPS CA bundle invalid") from exc
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        try:
            signer = serialization.load_pem_public_key(
                _read_trusted(Path(log_public_key_path), 4096))
        except (TypeError, ValueError) as exc:
            raise AdmissionDenied("log signer public key invalid") from exc
        if not isinstance(signer, Ed25519PublicKey):
            raise AdmissionDenied("log signer must be Ed25519")
        from cryptography.hazmat.primitives import serialization as wire
        actual = hashlib.sha256(signer.public_bytes(
            wire.Encoding.Raw, wire.PublicFormat.Raw)).hexdigest()
        if not hmac.compare_digest(actual, trusted_signer_fingerprint):
            raise AdmissionDenied("log signer fingerprint changed")
        self.signer = signer
        self.signer_fingerprint = actual
        self.cert_sha256 = trusted_cert_sha256
        self.host = target.hostname
        self.port = port
        self.url = url
        self.bearer = bearer

    def _get(self, path):
        # No proxy auto-configuration, HTTP redirect, user-controlled path,
        # or arbitrary upstream in this verifier. A failed connection is a
        # denial, not a fallback to an unsigned or insecure data source.
        if path != "/v1/head" and not re.fullmatch(
                r"/v1/proof\?previous_size=(0|[1-9][0-9]{0,2})", path):
            raise AdmissionDenied("unapproved log endpoint path")
        connection = HTTPSConnection(
            self.host, self.port, context=self.context, timeout=3)
        try:
            connection.connect()
            peer = connection.sock.getpeercert(binary_form=True)
            if not peer or not hmac.compare_digest(
                    hashlib.sha256(peer).hexdigest(), self.cert_sha256):
                raise AdmissionDenied("log TLS peer certificate pin mismatch")
            connection.request("GET", path, headers={
                "Authorization": "Bearer " + self.bearer,
                "Accept": "application/json",
                "Connection": "close",
            })
            response = connection.getresponse()
            if response.status != 200:
                raise AdmissionDenied("monitored log unavailable or returned non-200")
            if not response.getheader("Content-Type", "").startswith("application/json"):
                raise AdmissionDenied("monitored log response content type invalid")
            data = response.read(16385)
            if not 1 <= len(data) <= 16384:
                raise AdmissionDenied("monitored log response size denied")
            value = _parse(data)
            if not isinstance(value, dict):
                raise AdmissionDenied("monitored log response must be JSON object")
            return value
        except (OSError, ssl.SSLError, TimeoutError) as exc:
            raise AdmissionDenied("pinned HTTPS log unavailable") from exc
        finally:
            connection.close()

    def _head(self, bundle):
        if not isinstance(bundle, dict) or not {
            "head", "head_bytes_base64", "head_signature_base64"
        }.issubset(bundle):
            raise AdmissionDenied("signed log head envelope invalid")
        raw = _decode64(bundle["head_bytes_base64"])
        signature = _decode64(bundle["head_signature_base64"], 128)
        head = _parse(raw)
        if (not isinstance(head, dict) or
                set(head) != {"version", "tree_size", "root_sha256"} or
                type(head["version"]) is not int or head["version"] != 1 or
                type(head["tree_size"]) is not int or
                not 0 <= head["tree_size"] <= 256 or
                not _sha_valid(head["root_sha256"]) or
                bundle["head"] != head):
            raise AdmissionDenied("signed log head schema invalid")
        if (head["tree_size"] == 0 and head["root_sha256"] != _EMPTY):
            raise AdmissionDenied("empty signed log tree root invalid")
        if len(signature) != 64:
            raise AdmissionDenied("signed log signature length invalid")
        try:
            self.signer.verify(signature, canonical_tree_head(raw))
        except InvalidSignature as exc:
            raise AdmissionDenied("signed log head signature invalid") from exc
        return head

    def signed_head(self):
        return self._head(self._get("/v1/head"))

    def verify_extension(self, *, expected_head, previous_size,
                         previous_root_sha256):
        if type(previous_size) is not int or not 0 <= previous_size <= 256:
            raise AdmissionDenied("monitored previous size invalid")
        if not _sha_valid(previous_root_sha256):
            raise AdmissionDenied("independently pinned previous root required")
        if previous_size == 0 and previous_root_sha256 != _EMPTY:
            raise AdmissionDenied("monitored genesis root invalid")
        if expected_head["tree_size"] < previous_size:
            raise AdmissionDenied("signed log rollback below pinned size")
        if expected_head["tree_size"] == previous_size:
            if not hmac.compare_digest(
                    expected_head["root_sha256"], previous_root_sha256):
                raise AdmissionDenied("signed log same-size fork detected")
            return
        proof_bundle = self._get(
            "/v1/proof?previous_size=" + str(previous_size))
        verified_head = self._head(proof_bundle)
        if verified_head != expected_head:
            raise AdmissionDenied("signed log head changed during proof")
        proof = proof_bundle.get("proof")
        if not isinstance(proof, dict):
            raise AdmissionDenied("signed log compact proof missing")
        verify_compact_proof(
            json.dumps(proof, sort_keys=True).encode("ascii"),
            receipt_sha256=proof.get("receipt_sha256"),
            tree_size=expected_head["tree_size"],
            signed_root_sha256=expected_head["root_sha256"],
            previous_size=previous_size,
            trusted_previous_root_sha256=previous_root_sha256,
        )


class PinnedLogGossipMonitor:
    """Check both signed log views against a separately pinned prior root."""

    def __init__(self, primary, mirror):
        if not (isinstance(primary, PinnedHTTPSLogEndpoint) and
                isinstance(mirror, PinnedHTTPSLogEndpoint)):
            raise AdmissionDenied("two pinned HTTPS log endpoints required")
        if (primary.host == mirror.host and primary.port == mirror.port):
            raise AdmissionDenied("gossip requires distinct HTTPS endpoints")
        if primary.signer_fingerprint != mirror.signer_fingerprint:
            raise AdmissionDenied("gossip log signing roots differ")
        if primary.cert_sha256 == mirror.cert_sha256:
            raise AdmissionDenied("gossip endpoints require distinct TLS identities")
        self.primary = primary
        self.mirror = mirror

    def check(self, *, trusted_previous_size, trusted_previous_root_sha256):
        if type(trusted_previous_size) is not int or not 0 <= trusted_previous_size <= 256:
            raise AdmissionDenied("gossip requires prior approved tree size")
        if not _sha_valid(trusted_previous_root_sha256):
            raise AdmissionDenied("gossip requires prior approved root")
        a = self.primary.signed_head()
        b = self.mirror.signed_head()
        self.primary.verify_extension(
            expected_head=a, previous_size=trusted_previous_size,
            previous_root_sha256=trusted_previous_root_sha256)
        self.mirror.verify_extension(
            expected_head=b, previous_size=trusted_previous_size,
            previous_root_sha256=trusted_previous_root_sha256)
        if a["tree_size"] != b["tree_size"]:
            # Validate whether the lag is a genuine prefix rather than a
            # malicious fork, but deny either case until convergence.
            larger, smaller, endpoint = (
                (a,b,self.primary) if a["tree_size"] > b["tree_size"]
                else (b,a,self.mirror))
            endpoint.verify_extension(
                expected_head=larger,
                previous_size=smaller["tree_size"],
                previous_root_sha256=smaller["root_sha256"])
            raise AdmissionDenied("gossip replicas lagging; fail closed")
        if not hmac.compare_digest(a["root_sha256"], b["root_sha256"]):
            raise AdmissionDenied("gossip same-size signed fork detected")
        if a["tree_size"] == 0:
            raise AdmissionDenied("gossip has no witness receipts")
        return {"tree_size": a["tree_size"],
                "tree_root_sha256": a["root_sha256"],
                "log_signer_fingerprint": self.primary.signer_fingerprint,
                "observations": 2, "https_pins_verified": True}
