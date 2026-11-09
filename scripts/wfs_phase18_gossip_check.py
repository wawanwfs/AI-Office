#!/usr/bin/env python3
"""Owner-operated Phase 18 pinned HTTPS gossip CLI.

All trusted URLs, trust stores, exact TLS leaf DER hashes, log public key
fingerprints and previous root/size are independently provisioned. Bearers
are read only from environment variables, not argv or output. This tool
does not create, renew, discover or self-approve trusted pins. A mismatch
exits nonzero; no fallback to insecure HTTP is supported.
"""
import argparse
import json
import os
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from preview_admission_v2 import AdmissionDenied
from reference_log_gossip import PinnedHTTPSLogEndpoint, PinnedLogGossipMonitor

_ENV = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,63}\Z")


def _token(var):
    if not _ENV.fullmatch(var):
        raise AdmissionDenied("gossip token environment variable name invalid")
    token=os.environ.get(var, "")
    if not token:
        raise AdmissionDenied("operator-provisioned gossip bearer is missing")
    return token


def main():
    parser=argparse.ArgumentParser(
        description="Verify two independently configured HTTPS log endpoints; NOT host-independence certification")
    parser.add_argument("--primary-url",required=True)
    parser.add_argument("--primary-ca",required=True)
    parser.add_argument("--primary-tls-pin",required=True)
    parser.add_argument("--primary-token-env",default="WFS_LOG_PRIMARY_BEARER")
    parser.add_argument("--mirror-url",required=True)
    parser.add_argument("--mirror-ca",required=True)
    parser.add_argument("--mirror-tls-pin",required=True)
    parser.add_argument("--mirror-token-env",default="WFS_LOG_MIRROR_BEARER")
    parser.add_argument("--log-public-key",required=True)
    parser.add_argument("--log-key-pin",required=True)
    parser.add_argument("--previous-size",required=True,type=int)
    parser.add_argument("--previous-root",required=True)
    args=parser.parse_args()
    try:
        primary=PinnedHTTPSLogEndpoint(
            url=args.primary_url,bearer=_token(args.primary_token_env),
            ca_cert_path=args.primary_ca,
            trusted_cert_sha256=args.primary_tls_pin,
            log_public_key_path=args.log_public_key,
            trusted_signer_fingerprint=args.log_key_pin)
        mirror=PinnedHTTPSLogEndpoint(
            url=args.mirror_url,bearer=_token(args.mirror_token_env),
            ca_cert_path=args.mirror_ca,
            trusted_cert_sha256=args.mirror_tls_pin,
            log_public_key_path=args.log_public_key,
            trusted_signer_fingerprint=args.log_key_pin)
        result=PinnedLogGossipMonitor(primary,mirror).check(
            trusted_previous_size=args.previous_size,
            trusted_previous_root_sha256=args.previous_root)
    except (AdmissionDenied,OSError) as exc:
        # Do not echo token values, cert/key paths or untrusted response
        # content. One fixed message makes failure unambiguously fail-closed.
        print("Phase18 signed HTTPS gossip: DENIED",file=sys.stderr)
        return 2
    print(json.dumps({"status":"verified-consistent-test-only",**result},
                     sort_keys=True))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
