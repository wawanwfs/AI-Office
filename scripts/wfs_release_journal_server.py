#!/usr/bin/env python3
"""Read-only mTLS reference endpoint for an independently signed release journal."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import ssl
import sys
from threading import Lock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from preview_admission_v2 import AdmissionDenied
from preview_oci_layout import is_sha256, json_object, sha256
from preview_release_journal import MAX_BODY, ROUTE, journal_index, verify_journal
from preview_signature import _read_trusted


def serve(bind, port, cert, key, client_ca, client_fingerprint,
          journal, policy_key, policy_fingerprint, ready=None):
    if not is_sha256(client_fingerprint):
        raise ValueError("independent client certificate pin required")
    guard = Lock()
    observed = {}
    public = _read_trusted(policy_key, 4096)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if sha256(self.connection.getpeercert(binary_form=True) or b"") != client_fingerprint:
                self.send_error(403)
                return
            if self.path != ROUTE:
                self.send_error(404)
                return
            try:
                with guard:
                    raw = _read_trusted(journal, MAX_BODY)
                    document = json_object(raw)
                    if set(document) != {"entries"}:
                        raise AdmissionDenied("invalid journal document")
                    chain = verify_journal(document["entries"], public, policy_fingerprint)
                    digests = journal_index(chain)
                    if observed:
                        tip = max(observed)
                        if digests.get(tip) != observed[tip] or any(
                                observed[sequence] != digests[sequence]
                                for sequence in observed.keys() & digests.keys()):
                            raise AdmissionDenied("release journal cannot replace published history")
                    observed.clear()
                    observed.update(digests)
            except (OSError, ValueError):
                self.send_error(503, "current signed release journal unavailable")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, *args):
            pass

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(cert, key)
    ctx.load_verify_locations(cafile=client_ca)
    ctx.verify_mode = ssl.CERT_REQUIRED
    class TLSServer(ThreadingHTTPServer):
        def get_request(self):
            client, address = super().get_request()
            client.settimeout(3)
            try:
                return ctx.wrap_socket(client, server_side=True), address
            except OSError:
                client.close()
                raise

    with TLSServer((bind, port), Handler) as server:
        if ready is not None:
            Path(ready).write_text(str(server.server_port), encoding="ascii")
        server.serve_forever()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", required=True)
    parser.add_argument("--port", required=True, type=int)
    for name in ("cert", "key", "client-ca", "client-fingerprint", "journal",
                 "policy-key", "policy-fingerprint"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--ready", help="write chosen port to a private readiness file")
    serve(**vars(parser.parse_args()))


if __name__ == "__main__":
    main()
