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
from preview_oci_promotion import ApprovedOCIRelease
from preview_release_policy import SignedReleasePolicy
from preview_release_journal import JournalTLS, RemoteReleasePolicy
from preview_signature import verify_review_signature
from preview_authority import SignedPreviewAuthority
from preview_witness import SignedReviewerCheckpoint
from preview_transparency import SignedTransparencyEvidence


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
    parser.add_argument("--roster-root-public-key",required=True,
        help="separately provisioned Ed25519 roster authority public key")
    parser.add_argument("--roster-root-signature",required=True,
        help="base64 detached root signature of exact reviewer-policy JSON bytes")
    parser.add_argument("--trusted-roster-root-fingerprint",required=True,
        help="out-of-band SHA256 of roster authority raw public key")
    parser.add_argument("--witness-public-key",required=True,
        help="separately provisioned offline witness Ed25519 public key PEM")
    parser.add_argument("--witness-receipt",required=True,
        help="current independently issued and approved checkpoint JSON")
    parser.add_argument("--witness-signature",required=True,
        help="witness detached base64 signature over exact checkpoint bytes")
    parser.add_argument("--trusted-witness-fingerprint",required=True,
        help="out-of-band SHA256 fingerprint of raw witness Ed25519 public key")
    parser.add_argument("--trusted-checkpoint-sha256",required=True,
        help="latest approved witness receipt SHA256; never derive from input")
    parser.add_argument("--log-head",required=True,
        help="signed current transparency Merkle tree head JSON")
    parser.add_argument("--log-head-signature",required=True,
        help="separate log Ed25519 signature of exact domain-separated head")
    parser.add_argument("--log-public-key",required=True,
        help="independently controlled transparency log public Ed25519 key")
    parser.add_argument("--log-leaf-inventory",required=True,
        help="complete ordered receipt digest inventory of current tree")
    parser.add_argument("--log-compact-proof",required=True,
        help="separate compact RFC6962 inclusion and consistency JSON for current head")
    parser.add_argument("--trusted-log-head-sha256",required=True,
        help="latest signed tree head file hash approved out of band")
    parser.add_argument("--trusted-log-fingerprint",required=True,
        help="log signer raw public-key fingerprint provisioned out of band")
    parser.add_argument("--trusted-previous-tree-size",required=True,type=int,
        help="independently archived earlier log tree size; 0 for genesis")
    parser.add_argument("--trusted-previous-tree-root",required=True,
        help="independently archived earlier tree root SHA256; empty-tree for 0")
    parser.add_argument("--oci-archive",help="reviewed Linux/amd64 OCI layout tar")
    parser.add_argument("--oci-approval",help="current release witness approval JSON")
    parser.add_argument("--oci-signature",help="detached release witness signature")
    parser.add_argument("--oci-witness-key",help="release witness Ed25519 public PEM")
    parser.add_argument("--trusted-oci-approval-sha256",help="out-of-band current approval pin")
    parser.add_argument("--trusted-oci-witness-fingerprint",help="out-of-band release witness pin")
    parser.add_argument("--release-policy",help="signed current release checkpoint JSON")
    parser.add_argument("--release-policy-signature",help="detached checkpoint signature")
    parser.add_argument("--release-policy-public-key",help="separate release policy Ed25519 PEM")
    parser.add_argument("--trusted-release-policy-sha256",help="out-of-band current head hash")
    parser.add_argument("--trusted-release-policy-fingerprint",help="out-of-band signer pin")
    parser.add_argument("--minimum-release-policy-sequence",type=int,help="out-of-band sequence floor")
    parser.add_argument("--release-journal-url",help="operator-approved mTLS journal endpoint")
    parser.add_argument("--release-journal-ca",help="trusted TLS CA PEM")
    parser.add_argument("--release-journal-client-cert",help="operator TLS client certificate PEM")
    parser.add_argument("--release-journal-client-key",help="operator TLS client key PEM")
    parser.add_argument("--release-journal-server-sha256",help="pinned server leaf DER SHA-256")
    parser.add_argument("--discard-data",action="store_true",
                        help="required to remove disposable PostgreSQL volumes")
    args=parser.parse_args()
    if not args.approved:
        parser.error("local operator approval (--approved) is mandatory")
    if args.action=="start" and args.port is None:
        parser.error("start requires --port")
    if args.action!="start" and args.port is not None:
        parser.error("--port is only used for start")
    oci_inputs=(args.oci_archive,args.oci_approval,args.oci_signature,args.oci_witness_key,
                args.trusted_oci_approval_sha256,args.trusted_oci_witness_fingerprint)
    if not all(oci_inputs) and (any(oci_inputs) or args.action in ("start","logs","restart")):
        parser.error("all six OCI release and independent pin flags are required")
    oci_release=ApprovedOCIRelease(*oci_inputs) if all(oci_inputs) else None
    shared=(args.release_policy_public_key,args.trusted_release_policy_fingerprint,
            args.minimum_release_policy_sequence,args.trusted_release_policy_sha256)
    files=(args.release_policy,args.release_policy_signature)
    remote=(args.release_journal_url,args.release_journal_ca,args.release_journal_client_cert,
            args.release_journal_client_key,args.release_journal_server_sha256)
    release_policy=None
    if any(remote):
        if any(files) or not all(remote+shared):
            parser.error("remote journal requires mTLS, pins and no offline checkpoint files")
        release_policy=RemoteReleasePolicy(JournalTLS(*remote),*shared)
    elif any(value is not None for value in files+shared) or args.action in ("start","logs","restart"):
        if not all(files+shared):
            parser.error("all six release policy checkpoint and independent pin flags are required")
        pub,fingerprint,floor,head=shared
        release_policy=SignedReleasePolicy(*files,pub,head,fingerprint,floor)
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
    transparency=SignedTransparencyEvidence(
        head_path=args.log_head,
        signature_path=args.log_head_signature,
        public_key_path=args.log_public_key,
        inventory_path=args.log_leaf_inventory,
        compact_proof_path=args.log_compact_proof,
        trusted_head_sha256=args.trusted_log_head_sha256,
        trusted_log_fingerprint=args.trusted_log_fingerprint,
        trusted_previous_size=args.trusted_previous_tree_size,
        trusted_previous_root_sha256=args.trusted_previous_tree_root,
    )
    witness=SignedReviewerCheckpoint(
        public_key_path=args.witness_public_key,
        receipt_path=args.witness_receipt,
        signature_path=args.witness_signature,
        trusted_witness_fingerprint=args.trusted_witness_fingerprint,
        trusted_receipt_sha256=args.trusted_checkpoint_sha256,
        transparency_evidence=transparency,
    )
    authority=SignedPreviewAuthority(
        public_key_path=args.reviewer_public_key,
        signature_path=args.review_signature,
        policy_path=args.reviewer_policy,
        trusted_policy_sha256=args.trusted_policy_sha256,
        root_public_key_path=args.roster_root_public_key,
        root_signature_path=args.roster_root_signature,
        trusted_root_fingerprint=args.trusted_roster_root_fingerprint,
        witness_checkpoint=witness,
    )
    manager=TemplatePreviewManager(state/"registry.db",template,
        enabled=True,reviewed_files=approved_hashes,
        reviewer_authority=authority,oci_release=oci_release,release_policy=release_policy)
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
