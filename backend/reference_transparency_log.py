"""Phase 17 disposable *local* reference transparency HTTP log.

This is a single-writer, loopback-only, authenticated research service
with an fsync'd JSONL journal. It issues real signed RFC6962 heads and
compact inclusion/consistency proofs; it is NOT a physical WORM log,
independent operator/host, HTTPS/public service, non-equivocation gossip,
or security boundary for user-submitted source. All signing keys must
be provisioned independently; CI keys are synthetic.
"""
import argparse
import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import stat
from urllib.parse import parse_qs, urlsplit

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
)

from preview_admission_v2 import AdmissionDenied
from preview_compact_merkle import (
    make_consistency_path, make_inclusion_path,
)
from preview_transparency import canonical_tree_head, merkle_root

_DIGEST = re.compile(r"[a-f0-9]{64}\Z")
_MAX_ROWS = 256
_MAX_REQUEST = 1024
_MAX_JOURNAL = 65536


def _unique(pairs):
    value = {}
    for name, item in pairs:
        if name in value:
            raise ValueError("duplicate JSON key")
        value[name] = item
    return value


def _json(raw):
    try:
        return json.loads(raw, object_pairs_hook=_unique)
    except (UnicodeError, ValueError, TypeError) as exc:
        raise AdmissionDenied("malformed JSON input") from exc


def _digest(value):
    return isinstance(value, str) and _DIGEST.fullmatch(value) is not None


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def _safe_read(path, maximum):
    path = Path(path).absolute()
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise AdmissionDenied("unsafe reference-log file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)
    fd = os.open(path, flags)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode) or os.fstat(fd).st_size > maximum:
            raise AdmissionDenied("reference-log file size/type denied")
        with os.fdopen(fd, "rb", closefd=False) as source:
            data = source.read(maximum+1)
        if len(data) > maximum:
            raise AdmissionDenied("reference-log file too large")
        return data
    finally:
        os.close(fd)


class ReferenceLog:
    """One process, one fsync'd local journal, non-privileged signing key."""

    def __init__(self, journal_path, private_key):
        if not isinstance(private_key, Ed25519PrivateKey):
            raise AdmissionDenied("reference-log signer must be Ed25519")
        self.key = private_key
        self.journal = Path(journal_path).absolute()
        if (not self.journal.parent.is_dir() or
                self.journal.parent.is_symlink() or
                self.journal.is_symlink()):
            raise AdmissionDenied("reference-log journal path unsafe")
        self.leaves = self._recover()

    def _recover(self):
        leaves = []
        if self.journal.exists():
            raw = _safe_read(self.journal, _MAX_JOURNAL)
            if raw and not raw.endswith(b"\\n"):
                raise AdmissionDenied("reference-log journal is truncated")
            for line in raw.splitlines():
                if len(leaves) >= _MAX_ROWS or len(line) > 200:
                    raise AdmissionDenied("reference-log record bound exceeded")
                row = _json(line)
                if (not isinstance(row, dict) or
                        set(row) != {"index", "receipt_sha256", "root_sha256"} or
                        type(row["index"]) is not int or
                        row["index"] != len(leaves) or
                        not _digest(row["receipt_sha256"]) or
                        not _digest(row["root_sha256"]) or
                        row["receipt_sha256"] in leaves):
                    raise AdmissionDenied("reference-log journal record invalid")
                leaves.append(row["receipt_sha256"])
                root = merkle_root([bytes.fromhex(x) for x in leaves]).hex()
                if not hmac.compare_digest(root, row["root_sha256"]):
                    raise AdmissionDenied("reference-log journal root conflict")
        return leaves

    def _ensure_unchanged(self):
        # Detect external edits, truncations and file replacement before
        # issuing ANY new signed head or accepting another append. This
        # does not protect a malicious same-UID actor racing between reads.
        if self._recover() != self.leaves:
            raise AdmissionDenied("reference-log journal externally modified")

    def tree_head(self):
        self._ensure_unchanged()
        size = len(self.leaves)
        return {"version": 1, "tree_size": size,
                "root_sha256":merkle_root(
                    [bytes.fromhex(x) for x in self.leaves]).hex()}

    def signed_head(self):
        raw = _canonical(self.tree_head())
        return {"head": self.tree_head(),
                "head_bytes_base64": base64.b64encode(raw).decode("ascii"),
                "head_signature_base64":base64.b64encode(
                    self.key.sign(canonical_tree_head(raw))).decode("ascii")}

    def append(self, digest, expected_size, expected_root):
        if not _digest(digest) or not _digest(expected_root):
            raise AdmissionDenied("append digest or compare-and-swap root invalid")
        if type(expected_size) is not int or expected_size < 0:
            raise AdmissionDenied("append expected size invalid")
        prior = self.tree_head()
        if (prior["tree_size"] != expected_size or
                not hmac.compare_digest(prior["root_sha256"], expected_root)):
            raise AdmissionDenied("stale append expected tree head")
        if len(self.leaves) >= _MAX_ROWS or digest in self.leaves:
            raise AdmissionDenied("append duplicate or log capacity reached")
        candidate = self.leaves + [digest]
        root = merkle_root([bytes.fromhex(x) for x in candidate]).hex()
        record = {"index":len(self.leaves), "receipt_sha256":digest,
                  "root_sha256":root}
        payload = _canonical(record) + b"\n"
        # Each accepted append is written and fsync'd BEFORE any signature
        # of the new head is issued. Torn writes fail closed on next open.
        flags = (os.O_APPEND | os.O_CREAT | os.O_WRONLY |
                 getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
        fd = os.open(self.journal, flags, 0o600)
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode):
                raise AdmissionDenied("reference-log journal file changed")
            if os.stat(self.journal).st_ino != os.fstat(fd).st_ino:
                raise AdmissionDenied("reference-log journal inode replaced")
            with os.fdopen(fd, "ab", closefd=False) as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
        finally:
            os.close(fd)
        self.leaves = candidate
        return self.signed_head()

    def proof(self, previous_size):
        if (type(previous_size) is not int or
                not 0 <= previous_size <= len(self.leaves) or
                not self.leaves):
            raise AdmissionDenied("reference-log prior tree size invalid")
        digests = [bytes.fromhex(x) for x in self.leaves]
        size = len(digests)
        return {"version":1, "tree_size":size, "leaf_index":size-1,
                "receipt_sha256":self.leaves[-1],
                "inclusion":make_inclusion_path(digests, size-1),
                "previous_size":previous_size,
                "consistency":make_consistency_path(digests, previous_size)}


def handler_for(log, token):
    if not isinstance(token, str) or len(token) < 32 or not token.isascii():
        raise AdmissionDenied("reference-log auth token missing or too short")

    class Handler(BaseHTTPRequestHandler):
        server_version = "WFS-Reference-Log/1"
        sys_version = ""

        def log_message(self, *_args):
            # Never expose auth headers or witness receipt digests in logs.
            return

        def _response(self, status, body):
            raw = _canonical(body)
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def _authenticated(self):
            supplied = self.headers.get("Authorization", "")
            return hmac.compare_digest(supplied, "Bearer " + token)

        def do_GET(self):
            if not self._authenticated():
                return self._response(401, {"error":"authentication required"})
            url = urlsplit(self.path)
            if url.path == "/v1/head" and not url.query:
                try:
                    return self._response(200, log.signed_head())
                except AdmissionDenied:
                    return self._response(503, {"error":"journal integrity unavailable"})
            if url.path == "/v1/inventory" and not url.query:
                try:
                    return self._response(200, {
                        **log.signed_head(),
                        "inventory":{"version":1,
                                     "receipt_digests":list(log.leaves)}})
                except AdmissionDenied:
                    return self._response(503, {"error":"journal integrity unavailable"})
            if url.path == "/v1/proof":
                try:
                    args = parse_qs(url.query, strict_parsing=True)
                except ValueError:
                    return self._response(400, {"error":"invalid proof query"})
                if set(args) != {"previous_size"} or len(args["previous_size"]) != 1:
                    return self._response(400, {"error":"invalid proof query"})
                raw = args["previous_size"][0]
                if not raw.isdecimal() or len(raw) > 3:
                    return self._response(400, {"error":"invalid proof size"})
                try:
                    proof = log.proof(int(raw))
                except AdmissionDenied:
                    return self._response(409, {"error":"prior tree unavailable"})
                try:
                    return self._response(200, {**log.signed_head(), "proof":proof})
                except AdmissionDenied:
                    return self._response(503, {"error":"journal integrity unavailable"})
            return self._response(404, {"error":"route denied"})

        def do_POST(self):
            if not self._authenticated():
                return self._response(401, {"error":"authentication required"})
            if self.path != "/v1/append":
                return self._response(404, {"error":"route denied"})
            try:
                length = int(self.headers.get("Content-Length", ""))
            except ValueError:
                return self._response(400, {"error":"invalid request length"})
            if not 1 <= length <= _MAX_REQUEST:
                return self._response(413, {"error":"request size denied"})
            try:
                value = _json(self.rfile.read(length))
                if not isinstance(value, dict) or set(value) != {
                    "receipt_sha256", "expected_size", "expected_root_sha256"
                }:
                    raise AdmissionDenied("append request schema invalid")
                result = log.append(value["receipt_sha256"],
                                    value["expected_size"],
                                    value["expected_root_sha256"])
            except AdmissionDenied:
                return self._response(409, {"error":"append not authorized"})
            except OSError:
                return self._response(503, {"error":"journal write unavailable"})
            return self._response(201, result)

    return Handler


def serve_reference(*, journal_path, private_pem_path, token, port=0):
    # A production signer requires external custody; this disposable
    # reference at minimum refuses group/world-readable POSIX key files.
    if os.name == "posix" and os.stat(private_pem_path).st_mode & 0o077:
        raise AdmissionDenied("reference log private key permissions too broad")
    key_bytes = _safe_read(private_pem_path, 4096)
    try:
        key = serialization.load_pem_private_key(key_bytes, password=None)
    except (TypeError, ValueError) as exc:
        raise AdmissionDenied("reference log private key invalid") from exc
    reference = ReferenceLog(journal_path, key)
    # 127.0.0.1 is intentional. This service MUST NOT become an external
    # endpoint without independently approved TLS, auth and host custody.
    server = HTTPServer(("127.0.0.1", port), handler_for(reference, token))
    return server


def main():
    parser = argparse.ArgumentParser(description="LOCAL disposable reference log; NOT production")
    parser.add_argument("--journal", required=True)
    parser.add_argument("--private-key", required=True)
    parser.add_argument("--port", type=int, default=18847)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("reference log port must be nonprivileged")
    token = os.environ.get("WFS_REF_LOG_TOKEN", "")
    with serve_reference(journal_path=args.journal, private_pem_path=args.private_key,
                         token=token, port=args.port) as server:
        server.serve_forever(poll_interval=0.1)


if __name__ == "__main__":
    main()
