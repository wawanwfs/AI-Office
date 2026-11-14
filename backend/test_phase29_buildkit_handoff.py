"""Local descriptor checks for the disposable BuildKit CI handoff."""
import importlib.util
import os
from pathlib import Path
import sys

import pytest


@pytest.fixture
def handoff():
    if sys.platform != "linux" or not hasattr(os, "memfd_create"):
        pytest.skip("Linux memfd required")
    import fcntl
    if not hasattr(fcntl, "F_GET_SEALS"):
        pytest.skip("Python kernel seal bindings required")
    spec = importlib.util.spec_from_file_location(
        "phase29_handoff", Path(__file__).resolve().parents[1] /
        "scripts/ci_phase29_rootless_buildkit.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_builder_checks_seals_digest_and_seek(handoff):
    import fcntl
    import hashlib

    fd = os.memfd_create("phase29-test", os.MFD_ALLOW_SEALING)
    try:
        data = b"reviewed-context"
        os.write(fd, data)
        expected = hashlib.sha256(data).hexdigest()
        with pytest.raises(RuntimeError, match="lacks mandatory kernel seals"):
            handoff.check_sealed_context(expected, fd)
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, handoff.FULL_SEALS)
        with pytest.raises(RuntimeError, match="differs from reviewed digest"):
            handoff.check_sealed_context("0" * 64, fd)
        handoff.check_sealed_context(expected, fd)
        assert os.read(fd, len(data)) == data
    finally:
        os.close(fd)
