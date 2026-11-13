"""Phase 19 kernel-sealed, reviewed-template Docker build context tests.

These are Linux-only kernel syscall tests, NOT proof of daemon privilege
separation, physical WORM, rootless builder or Windows Docker Desktop.
"""
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile

import pytest

from preview_admission_v2 import AdmissionDenied
from preview_sealed_build import (
    linux_sealing_supported, seal_reviewed_preview_context,
)


@pytest.fixture
def approved(tmp_path):
    stage = tmp_path / "examples" / "fullstack-preview"
    stage.mkdir(parents=True)
    template = b"FROM scratch\nCOPY api.py /app/api.py\n"
    api = b"print('wfs-test-reviewed-api')\n"
    (stage / "Dockerfile.api").write_bytes(template)
    (stage / "api.py").write_bytes(api)
    hashes = {
        "Dockerfile.api": hashlib.sha256(template).hexdigest(),
        "api.py": hashlib.sha256(api).hexdigest(),
    }

    dist = tmp_path / "artifacts/fullstack-preview/dist"
    nested = "assets/" + "a" * 110 + ".js"
    files = {nested: b"export default 42;\n", "index.html": b"<!doctype html>\n"}
    for name, data in files.items():
        asset = dist / name
        asset.parent.mkdir(parents=True, exist_ok=True)
        asset.write_bytes(data)

    class Snapshot:
        reviewed = {"sources": hashes, "frontend": {
            name: hashlib.sha256(data).hexdigest() for name, data in files.items()
        }}

        def verify(self, project_id):
            if project_id != "alpha":
                raise AdmissionDenied("unreviewed project")
            return stage / "compose.yaml"

    return Snapshot(), stage, hashes


def test_kernel_seals_freeze_bytes_under_same_uid_attacker(approved):
    snapshots, stage, hashes = approved
    if not linux_sealing_supported():
        pytest.skip("kernel memfd seals only on Linux")
    with seal_reviewed_preview_context(snapshots, "alpha") as bundle:
        assert bundle.verify()
        with os.fdopen(os.dup(bundle.fd), "rb") as handle:
            os.lseek(handle.fileno(), 0, os.SEEK_SET)
            context = handle.read()
        assert hashlib.sha256(context).hexdigest() == bundle.tar_sha256
        with tarfile.open(fileobj=io.BytesIO(context), mode="r:") as tar:
            dist = stage.parents[1] / "artifacts/fullstack-preview/dist"
            assets = snapshots.reviewed["frontend"]
            assert tar.getnames() == ["Dockerfile.api", "api.py"] + [
                "dist/" + name for name in sorted(assets)
            ]
            assert all(member.isfile() and member.mtime == 0 for member in tar)
            assert tar.extractfile("api.py").read() == (stage / "api.py").read_bytes()
            assert tar.extractfile("Dockerfile.api").read() == (
                (stage / "Dockerfile.api").read_bytes() + b"COPY dist/ /app/dist/\n")
            for name, digest in assets.items():
                packed = tar.extractfile("dist/" + name).read()
                assert packed == (dist / name).read_bytes()
                assert hashlib.sha256(packed).hexdigest() == digest
        # Real separate SAME-UID process inherits the sealed fd.
        attacker = """
import json,os,sys
fd=int(sys.argv[1])
out={}
for name,task in (
    ('write',lambda:os.write(fd,b'EVIL')),
    ('truncate',lambda:os.ftruncate(fd,1)),
    ('reopened-write',lambda: (lambda d:(os.write(d,b'EVIL'),os.close(d)))(os.open('/proc/self/fd/'+str(fd),os.O_WRONLY))),
):
    try:
        out[name]='ALLOWED' if task() is not None else 'ALLOWED'
    except OSError:
        out[name]='DENIED'
print(json.dumps(out))
"""
        run = subprocess.run(
            [sys.executable, "-c", attacker, str(bundle.fd)],
            capture_output=True, text=True, timeout=10,
            pass_fds=(bundle.fd,), check=False)
        assert run.returncode == 0, run.stderr
        assert json.loads(run.stdout) == {
            "write": "DENIED", "truncate": "DENIED",
            "reopened-write": "DENIED",
        }
        with seal_reviewed_preview_context(snapshots, "alpha") as second:
            assert second.tar_sha256 == bundle.tar_sha256
        (dist / "index.html").write_bytes(b"changed post seal")
        (stage / "api.py").write_bytes(b"print('MALICIOUS POST SEAL')\n")
        assert bundle.verify()
        with pytest.raises(AdmissionDenied, match="differs from reviewed digest"):
            seal_reviewed_preview_context(snapshots, "alpha")
    with pytest.raises(AdmissionDenied, match="kernel-sealed build descriptor"):
        bundle.verify()


def test_snapshot_validation_and_manifest_rejection(approved):
    snapshots, stage, hashes = approved
    if not linux_sealing_supported():
        pytest.skip("kernel memfd seals only on Linux")
    with pytest.raises(AdmissionDenied, match="unreviewed project"):
        seal_reviewed_preview_context(snapshots, "bravo")
    original = (stage / "api.py").read_bytes()
    (stage / "api.py").write_bytes(b"wrong")
    with pytest.raises(AdmissionDenied, match="differs from reviewed digest"):
        seal_reviewed_preview_context(snapshots, "alpha")
    (stage / "api.py").write_bytes(original)
    link = stage / "api.py"
    link.unlink()
    try:
        link.symlink_to(stage / "Dockerfile.api")
    except OSError:
        pytest.skip("host does not permit symlinks")
    with pytest.raises(AdmissionDenied, match="symlink"):
        seal_reviewed_preview_context(snapshots, "alpha")


def test_sealed_build_refuses_untrusted_docker_parameters(approved):
    snapshots, stage, hashes = approved
    if not linux_sealing_supported():
        pytest.skip("kernel memfd seals only on Linux")
    with seal_reviewed_preview_context(snapshots, "alpha") as bundle:
        for invalid in ("evil/unreviewed:latest", "wfs-phase19-ci-a;rm -rf /",
                        "wfs-phase19-ci-UPPERCASE"):
            with pytest.raises(AdmissionDenied, match="tag outside CI namespace"):
                bundle.build_disposable_image(invalid)
        assert bundle.verify()


def test_windows_no_unsealed_file_fallback(approved):
    if linux_sealing_supported():
        pytest.skip("Linux sealed path supported")
    snapshots, stage, hashes = approved
    with pytest.raises(AdmissionDenied, match="kernel memfd seals unavailable"):
        seal_reviewed_preview_context(snapshots, "alpha")

@pytest.mark.parametrize("change, message", [
    ("replace", "differs from reviewed digest"),
    ("remove", "index.html missing"),
    ("add", "inventory differs"),
    ("symlink", "contains symlink"),
])
def test_frontend_must_match_signed_inventory_at_seal_time(approved, change, message):
    if not linux_sealing_supported():
        pytest.skip("kernel memfd seals only on Linux")
    snapshots, stage, _ = approved
    dist = stage.parents[1] / "artifacts/fullstack-preview/dist"
    index = dist / "index.html"
    if change == "replace":
        index.write_bytes(b"changed after snapshot verification")
    elif change == "remove":
        index.unlink()
    elif change == "add":
        (dist / "unreviewed.txt").write_bytes(b"never copy me")
    else:
        index.unlink()
        index.symlink_to(stage / "api.py")
    with pytest.raises(AdmissionDenied, match=message):
        seal_reviewed_preview_context(snapshots, "alpha")


def test_rejects_changed_copy_instruction_even_with_matching_digest(approved):
    if not linux_sealing_supported():
        pytest.skip("kernel memfd seals only on Linux")
    snapshots, stage, hashes = approved
    dockerfile = b"FROM scratch\nCOPY api.py /unapproved/path.py\n"
    (stage / "Dockerfile.api").write_bytes(dockerfile)
    hashes["Dockerfile.api"] = hashlib.sha256(dockerfile).hexdigest()
    with pytest.raises(AdmissionDenied, match="reviewed Dockerfile API COPY stanza changed"):
        seal_reviewed_preview_context(snapshots, "alpha")
