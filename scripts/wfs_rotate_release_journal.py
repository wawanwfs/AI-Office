#!/usr/bin/env python3
"""Prepare an offline journal bridge or assemble a separately signed candidate."""
import argparse
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from preview_admission_v2 import AdmissionDenied
from preview_oci_layout import json_object
from preview_release_journal import MAX_BODY, encode_entry, rotation_checkpoint, verify_journal
from preview_release_policy import checkpoint_message
from preview_signature import _read_trusted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "assemble"))
    parser.add_argument("--journal", required=True)
    parser.add_argument("--policy-key", required=True)
    parser.add_argument("--policy-fingerprint", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--signature", help="offline detached base64 Ed25519 signature")
    args = parser.parse_args()
    if (args.action == "assemble") != bool(args.signature):
        parser.error("assemble requires a signature; prepare does not")
    try:
        document = json_object(_read_trusted(args.journal, MAX_BODY))
        if set(document) != {"entries"}:
            raise AdmissionDenied("invalid release journal document")
        entries = document["entries"]
        public_key = _read_trusted(args.policy_key, 4096)
        raw = rotation_checkpoint(entries, public_key, args.policy_fingerprint)
        if args.action == "prepare":
            output = checkpoint_message(raw, chained=True, rotation=True)
        else:
            candidate = [entries[-1], encode_entry(raw, _read_trusted(args.signature, 1024))]
            verify_journal(candidate, public_key, args.policy_fingerprint)
            output = json.dumps({"entries": candidate}, separators=(",", ":")).encode("ascii")
        # Never overwrite the currently published journal or an archived window.
        with args.output.open("xb") as stream:
            stream.write(output)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Rotation denied: {exc}\n")


if __name__ == "__main__":
    main()
