"""Phase 19: real BuildKit from a sealed reviewed tar, disposable CI only.

Called inside the existing operator CI after independently signed
manifest review and staging. Never called from public HTTP gateway.
This does NOT change the ordinary Compose build path.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

from preview_admission_v2 import AdmissionDenied
from preview_sealed_build import seal_reviewed_preview_context

def prove_sealed_build(manager, project_id):
    original_path = manager.snapshots.verify(project_id)
    staged_api = original_path.parent / "api.py"
    original = staged_api.read_bytes()
    original_mode = staged_api.stat().st_mode & 0o777
    expected = manager.snapshots.reviewed["sources"]["api.py"]
    if hashlib.sha256(original).hexdigest() != expected:
        raise AssertionError("signed reviewed API source unavailable")
    image = "wfs-phase19-ci-" + secrets.token_hex(6)
    proof = {}
    with seal_reviewed_preview_context(manager.snapshots, project_id) as sealed:
        assert sealed.verify()
        proof["tar_sha256"] = sealed.tar_sha256
        proof["sealed_tar_size"] = sealed.size
        # Existing same-UID staging owner can always chmod and rewrite
        # a mode-0444 file; adversarial tests MUST acknowledge this.
        staged_api.chmod(0o600)
        staged_api.write_bytes(b"raise SystemExit('ATTACKER MUTATED ORIGINAL STAGING')\n")
        try:
            try:
                manager.snapshots.verify(project_id)
            except AdmissionDenied:
                proof["ordinary_staging_race_detected"] = True
            else:
                raise AssertionError("modified staging incorrectly still reviewed")
            assert sealed.verify(), "sealed FD affected by a mutable checkout"
            built = sealed.build_disposable_image(image, timeout=240)
            assert built["source_sha256"] == expected
            # The image is actually built from the SEALED tar even
            # though the ordinary staged api.py is hostile RIGHT NOW.
            command = [
                "docker", "run", "--rm", "--pull=never", "--network=none",
                "--read-only", "--user=65534:65534", "--cap-drop=ALL",
                "--security-opt=no-new-privileges:true", image,
                "python", "-c",
                "import hashlib,pathlib; "
                "print(hashlib.sha256(pathlib.Path('/app/api.py').read_bytes()).hexdigest())",
            ]
            response = subprocess.run(command, capture_output=True, text=True,
                                      timeout=45, check=False)
            if response.returncode != 0:
                raise AssertionError("sealed Docker image isolated runtime proof failed")
            seen = response.stdout.strip().splitlines()[-1]
            if seen != expected:
                raise AssertionError("build output differs from reviewed API SHA256")
            proof["built_image_source_equals_signed_manifest"] = True
            proof["same_uid_mutable_staging_during_actual_build"] = True
            proof["kernel_seals_checked"] = True
            proof["image_runtime_unprivileged"] = True
            # No claims about OCI provenance or daemon UID separation.
            proof["daemon_rootless_or_independent_principal_proved"] = False
            proof["production_compose_uses_sealed_context"] = False
        finally:
            staged_api.write_bytes(original)
            staged_api.chmod(original_mode)
            try:
                subprocess.run(["docker","image","rm","-f",image],
                    capture_output=True,text=True,timeout=20,check=False)
            except (OSError, subprocess.TimeoutExpired):
                pass
    manager.snapshots.verify(project_id)
    assert proof["ordinary_staging_race_detected"]
    assert proof["built_image_source_equals_signed_manifest"]
    return proof
