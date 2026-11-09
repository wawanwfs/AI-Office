"""Phase 19 kernel-sealed, reviewed-template Docker build context tests.

These are Linux-only kernel syscall tests, NOT proof of daemon privilege
separation, physical WORM, rootless builder or Windows Docker Desktop.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
from types import SimpleNamespace

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

    class Snapshot:
        reviewed = {"sources": hashes}

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
            assert sorted(tar.getnames()) == ["Dockerfile.api", "api.py"]
            assert tar.extractfile("api.py").read() == (stage / "api.py").read_bytes()
            assert tar.extractfile("Dockerfile.api").read() == (
                stage / "Dockerfile.api").read_bytes()
        # Real separate SAME-UID process inherits the sealed fd.
        attacker = """
import json,os,sys
fd=int(sys.argv[1])
out={}
for name,task in (
    ('write',lambda:os.write(fd,b'EVIL')),
    ('truncate',lambda:os.ftruncate(fd,1)),
    ('open-write',lambda:os.open('/proc/self/fd/'+str(fd),os.O_WRONLY)),
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
            "open-write": "DENIED",
        }
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
        link.symlink_to(tmp_path := stage / "Dockerfile.api")
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
