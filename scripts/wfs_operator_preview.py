#!/usr/bin/env python3
"""WFS preview operator CLI — disposable reviewed example only.

Never invoke from the public gateway, user task prompt or an LLM tool.
Runs Docker Compose under an explicitly approved local operator.
The current preview is the fixed reviewed React/FastAPI/Postgres template;
arbitrary generated project source admission is NOT available.
"""
import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from preview_manager import TemplatePreviewManager, PreviewDenied
from preview_signature import verify_review_signature
from preview_authority import SignedPreviewAuthority


def main():
    parser=argparse.ArgumentParser(description="WFS isolated template preview operator")
    parser.add_argument("action",choices=("start","status","logs","restart","stop"))
    parser.add_argument("--project",required=True)
    parser.add_argument("--port",type=int,help="19000-22000; required only on start")
    parser.add_argument("--state-root",required=True,help="private local disposable directory")
    parser.add_argument("--approved",action="store_true")
    parser.add_argument("--reviewed-manifest",required=True,
        help="independently approved v2 JSON: sources, frontend, lock, SBOM, image references")
    parser.add_argument("--reviewer-public-key",required=True,
        help="trusted Ed25519 reviewer public key (PEM), provisioned separately")
    parser.add_argument("--review-signature",required=True,
        help="detached base64 Ed25519 signature over canonical reviewed manifest")
    parser.add_argument("--trusted-reviewer-fingerprint",required=True,
        help="SHA-256 of reviewer raw public key, verified out-of-band")
    parser.add_argument("--reviewer-policy",required=True,
        help="operator-owned allowlist/revocation policy v1, provisioned out of band")
    parser.add_argument("--trusted-policy-sha256",required=True,
        help="independently pinned policy file SHA256; never derive from upload")
    parser.add_argument("--discard-data",action="store_true",
                        help="required to remove disposable PostgreSQL volumes")
    args=parser.parse_args()
    if not args.approved:
        parser.error("local operator approval (--approved) is mandatory")
    if args.action=="start" and args.port is None:
        parser.error("start requires --port")
    if args.action!="start" and args.port is not None:
        parser.error("--port is only used for start")
    state=Path(args.state_root).absolute()
    if state.is_symlink():
        parser.error("symlinked state directory denied")
    if not state.exists():
        state.mkdir(parents=True,mode=0o700)
    if not state.is_dir() or state.resolve()!=state:
        parser.error("unsafe state root")
    template=Path(__file__).resolve().parents[1]/"examples"/"fullstack-preview"/"compose.yaml"
    admission_file=Path(args.reviewed_manifest).absolute()
    if (admission_file.is_symlink() or not admission_file.is_file() or
            admission_file.resolve()!=admission_file or
            admission_file.stat().st_size>131072):
        parser.error("unsafe reviewed admission manifest")
    try:
        approved_hashes=json.loads(admission_file.read_text(encoding="utf-8"))
    except (OSError,ValueError) as exc:
        parser.error("invalid reviewed admission JSON")
    # Approval cannot self-authenticate: the expected key fingerprint must
    # come from the operator's independent trust policy, not this JSON.
    verify_review_signature(
        approved_hashes, public_key_path=args.reviewer_public_key,
        signature_path=args.review_signature,
        trusted_fingerprint=args.trusted_reviewer_fingerprint,
    )
    authority=SignedPreviewAuthority(
        public_key_path=args.reviewer_public_key,
        signature_path=args.review_signature,
        policy_path=args.reviewer_policy,
        trusted_policy_sha256=args.trusted_policy_sha256,
    )
    manager=TemplatePreviewManager(state/"registry.db",template,
        enabled=True,reviewed_files=approved_hashes,
        reviewer_authority=authority)
    if args.action=="status":
        result=manager.status(args.project)
    else:
        token=os.environ.get("WFS_PREVIEW_TEST_TOKEN","")
        if not token:
            parser.error("WFS_PREVIEW_TEST_TOKEN must be explicitly provided in environment")
        if args.action=="start":
            result=manager.start(args.project,args.port,token)
        elif args.action=="logs":
            result=manager.logs(args.project,token)
        elif args.action=="restart":
            result=manager.restart(args.project,token)
        else:
            result=manager.stop(args.project,token,allow_data_loss=args.discard_data)
    print(result)
    if args.action in ("start","restart"):
        print("Loopback preview only. Not authenticated public multi-tenant deployment.")


if __name__=="__main__":
    main()
