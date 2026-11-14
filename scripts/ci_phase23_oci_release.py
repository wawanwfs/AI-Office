"""Build and verify the fixed preview's OCI release in disposable Linux CI."""
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from preview_oci_approval import approval_message, frontend_sha256
from preview_oci_layout import PLATFORM, sha256, verify_layout
from preview_oci_promotion import ApprovedOCIRelease
from preview_sealed_build import seal_reviewed_preview_context
from preview_signature import canonical_review_bytes


def _supervisor(*args):
    return ["sudo", "-n", sys.executable, "-I", "-B",
            str(Path(__file__).with_name("ci_phase29_rootless_buildkit.py")),
            "--disposable-ci", *args]


def _export(snapshots, project, destination):
    with seal_reviewed_preview_context(snapshots, project) as context:
        context.verify()
        os.lseek(context.fd, 0, os.SEEK_SET)
        with os.fdopen(os.dup(context.fd), "rb") as sealed_input:
            with destination.open("xb") as output:
                result = subprocess.run(
                    _supervisor("--context-sha256", context.tar_sha256),
                    stdin=sealed_input, stdout=output, stderr=subprocess.PIPE,
                    timeout=430)
        diagnostics = result.stderr.decode("utf-8", "replace")
        if result.returncode:
            print(diagnostics[-12000:], file=sys.stderr)
            raise RuntimeError("separate rootless BuildKit export failed")
        context.verify()
        prefix = "WFS_ROOTLESS_BUILDKIT "
        receipt, = (json.loads(line[len(prefix):]) for line in diagnostics.splitlines()
                    if line.startswith(prefix))
        assert receipt["sealed_context_sha256"] == context.tar_sha256
        assert receipt["operator_uid"] == os.geteuid()
        return receipt


def _verify_distinct_principal(archive, review):
    with archive.open("rb") as source:
        result = subprocess.run(
            _supervisor("--verify-review", json.dumps(review, separators=(",", ":"))),
            stdin=source, capture_output=True, timeout=105)
    if result.returncode:
        print(result.stderr.decode("utf-8", "replace")[-3000:], file=sys.stderr)
        raise RuntimeError("distinct OCI verifier rejected the build result")
    return json.loads(result.stdout)


def prepare_oci_release(snapshots, project, source_reviewer_fingerprint, root):
    """No production keys: ephemeral CI signs an already verified archive."""
    archive = root / "reviewed-preview.oci.tar"
    build_receipt = _export(snapshots, project, archive)
    review = snapshots.reviewed
    checked = verify_layout(archive, frontend=review["frontend"],
                            api_sha256=review["sources"]["api.py"])
    verifier_receipt = _verify_distinct_principal(archive, review)
    assert verifier_receipt["manifest_digest"] == checked.manifest_digest
    assert verifier_receipt["config_digest"] == checked.config_digest
    assert verifier_receipt["verifier_uid"] not in (0, os.geteuid(), build_receipt["daemon_uid"])
    review_sha256 = sha256(canonical_review_bytes(review))
    now = int(time.time())
    approval = {
        "version": 1, "manifest_digest": checked.manifest_digest,
        "platform": PLATFORM, "review_sha256": review_sha256,
        "frontend_sha256": frontend_sha256(review["frontend"]),
        "issued_at": now, "expires_at": now + 900,
    }
    raw = json.dumps(approval, sort_keys=True).encode("ascii")
    witness = Ed25519PrivateKey.generate()
    public_key = witness.public_key()
    fingerprint = sha256(public_key.public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw))
    assert fingerprint != source_reviewer_fingerprint
    paths = {
        "review-path": root / "review.json",
        "approval-path": root / "approval.json",
        "signature-path": root / "approval.sig",
        "witness-key-path": root / "witness.pem",
    }
    paths["review-path"].write_text(json.dumps(review), encoding="utf-8")
    paths["approval-path"].write_bytes(raw)
    paths["signature-path"].write_bytes(base64.b64encode(
        witness.sign(approval_message(raw))))
    paths["witness-key-path"].write_bytes(public_key.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    verifier = Path(__file__).resolve().parents[1] / "backend/preview_oci_approval.py"
    args = [sys.executable, str(verifier), str(archive)]
    for key, value in {
        **paths, "trusted-approval-sha256": sha256(raw),
        "trusted-witness-fingerprint": fingerprint,
        "trusted-reviewer-fingerprint": source_reviewer_fingerprint,
        "trusted-review-sha256": review_sha256,
    }.items():
        args.extend(["--" + key, str(value)])
    proc = subprocess.run(args, cwd=root, env={"PATH": "", "PYTHONNOUSERSITE": "1"},
                          capture_output=True, text=True, check=True, timeout=90)
    result = json.loads(proc.stdout)
    assert result["manifest_digest"] == checked.manifest_digest
    assert result["config_digest"] == checked.config_digest
    assert result["manifest_digest"] != result["config_digest"]
    release = ApprovedOCIRelease(archive, paths["approval-path"], paths["signature-path"],
                                 paths["witness-key-path"], sha256(raw), fingerprint)
    return release, {**result, "sealed_context_sha256": build_receipt["sealed_context_sha256"],
            "isolated_builder": {**build_receipt, **verifier_receipt},
            "review_sha256": review_sha256, "frontend_sha256": approval["frontend_sha256"],
            "approval_sha256": sha256(raw), "witness_fingerprint": fingerprint,
            "verifier_process_separate_from_builder": True,
            "witness_key_synthetic_ci_only": True,
            "runtime_oci_admission_enforced": False,
            "off_host_key_custody_proven": False}
