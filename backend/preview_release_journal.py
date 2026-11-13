"""Authenticated read-only transport for a bounded signed release journal."""
import base64
import binascii
from dataclasses import dataclass
from http.client import HTTPException, HTTPSConnection
import json
from pathlib import Path
import ssl
from threading import Lock
from urllib.parse import urlsplit

from preview_admission_v2 import AdmissionDenied
from preview_oci_layout import is_sha256, json_object, sha256
from preview_release_policy import check_release_decision, verify_signed_checkpoint
from preview_signature import _read_trusted

ROUTE = "/v1/oci-release-journal"
GENESIS = "0" * 64
MAX_RECORDS = 64
MAX_BODY = 400 * 1024


def encode_entry(raw, signature):
    return {"checkpoint": base64.b64encode(raw).decode("ascii"),
            "signature": signature.decode("ascii").strip()}


def verify_journal(entries, public_key, fingerprint):
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_RECORDS:
        raise AdmissionDenied("release journal is empty or exceeds record limit")
    chain = []
    previous = GENESIS
    for index, entry in enumerate(entries, 1):
        if (not isinstance(entry, dict) or set(entry) != {"checkpoint", "signature"}
                or not isinstance(entry["checkpoint"], str)
                or not 1 <= len(entry["checkpoint"]) <= 5464
                or not isinstance(entry["signature"], str)
                or len(entry["signature"]) != 88):
            raise AdmissionDenied("invalid release journal entry")
        try:
            raw = base64.b64decode(entry["checkpoint"], validate=True)
            signature = entry["signature"].encode("ascii")
        except (binascii.Error, ValueError) as exc:
            raise AdmissionDenied("invalid release journal encoding") from exc
        policy = verify_signed_checkpoint(raw, signature, public_key, fingerprint, chained=True)
        if policy["sequence"] != index or policy["previous_sha256"] != previous:
            raise AdmissionDenied("release journal chain is not contiguous")
        previous = sha256(raw)
        chain.append((previous, policy))
    return chain


@dataclass(frozen=True)
class JournalTLS:
    url: str
    ca_path: Path
    client_cert_path: Path
    client_key_path: Path
    server_fingerprint: str

    def fetch(self):
        try:
            url = urlsplit(self.url)
            if (url.scheme != "https" or not url.hostname or url.path != ROUTE
                    or url.username is not None or url.password is not None
                    or url.query or url.fragment or not is_sha256(self.server_fingerprint)):
                raise AdmissionDenied("invalid HTTPS release journal endpoint or certificate pin")
            ctx = ssl.create_default_context(cafile=str(self.ca_path))
            ctx.minimum_version = ssl.TLSVersion.TLSv1_2
            ctx.load_cert_chain(str(self.client_cert_path), str(self.client_key_path))
            conn = HTTPSConnection(url.hostname, url.port, context=ctx, timeout=3)
            try:
                conn.connect()
                certificate = conn.sock.getpeercert(binary_form=True)
                if not certificate or sha256(certificate) != self.server_fingerprint:
                    raise AdmissionDenied("release journal TLS certificate pin mismatch")
                conn.request("GET", ROUTE, headers={"Accept": "application/json",
                                                    "Cache-Control": "no-cache"})
                with conn.getresponse() as response:
                    if (response.status != 200 or response.getheader("Transfer-Encoding")
                            or response.headers.get_content_type() != "application/json"):
                        raise AdmissionDenied("release journal HTTPS response rejected")
                    sizes = response.headers.get_all("Content-Length") or []
                    if (len(sizes) != 1 or not sizes[0].isascii() or not sizes[0].isdigit()
                            or len(sizes[0]) > 6 or not 1 <= int(sizes[0]) <= MAX_BODY):
                        raise AdmissionDenied("release journal HTTPS response size rejected")
                    raw = response.read(int(sizes[0]))
                    if len(raw) != int(sizes[0]):
                        raise AdmissionDenied("release journal HTTPS response truncated")
            finally:
                conn.close()
        except AdmissionDenied:
            raise
        except (OSError, HTTPException, ValueError, TypeError) as exc:
            raise AdmissionDenied("release journal HTTPS source unavailable") from exc
        value = json_object(raw)
        if set(value) != {"entries"}:
            raise AdmissionDenied("invalid release journal response")
        return value["entries"]


class RemoteReleasePolicy:
    """Verify authenticated publication and its externally anchored history.

    On each invocation the caller supplies an external anchor. The in-memory
    high-water mark also protects later checks in the same process, not
    another process or simultaneous rollback of the operator's external pins.
    """
    def __init__(self, tls, public_key_path, key_fingerprint, anchor_sequence, anchor_sha256):
        if (not isinstance(tls, JournalTLS) or not is_sha256(key_fingerprint)
                or type(anchor_sequence) is not int or not 1 <= anchor_sequence <= MAX_RECORDS
                or not is_sha256(anchor_sha256)):
            raise AdmissionDenied("independent release journal anchor and key required")
        self.tls = tls
        self.public_key_path = public_key_path
        self.key_fingerprint = key_fingerprint
        self.anchor_sequence = anchor_sequence
        self.anchor_sha256 = anchor_sha256
        self._observed = (anchor_sequence, anchor_sha256)
        self._lock = Lock()

    def verify(self, *, manifest_digest, approval_sha256, reviewer_fingerprint,
               release_witness_fingerprint, now=None):
        with self._lock:
            chain = verify_journal(self.tls.fetch(), _read_trusted(self.public_key_path, 4096),
                                   self.key_fingerprint)
            sequence, digest = self._observed
            if len(chain) < sequence or chain[sequence - 1][0] != digest:
                raise AdmissionDenied("release journal rollback or fork from trusted anchor")
            # Record authenticated new history even when the tip revokes,
            # expires, or applies to another manifest.
            self._observed = (len(chain), chain[-1][0])
            return check_release_decision(
                chain[-1][1], manifest_digest=manifest_digest, approval_sha256=approval_sha256,
                reviewer_fingerprint=reviewer_fingerprint,
                release_witness_fingerprint=release_witness_fingerprint,
                policy_key_fingerprint=self.key_fingerprint,
                minimum_sequence=sequence, now=now)
