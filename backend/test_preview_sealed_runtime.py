"""Phase 20 image-only operator proof; synthetic approval fixtures only.

A real two-tenant Docker operator acceptance additionally runs BuildKit,
a malicious staged-source mutation and checks running containers' image ID.
No tests in this module claim rootless or registry provenance.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest

from preview_admission_v2 import AdmissionDenied
from preview_sealed_build import linux_sealing_supported
from preview_sealed_runtime import (
    SealedRuntimeCompose, derive_image_only_compose,
    is_local_image_id, verify_local_image_exists,
)


@pytest.fixture
def signed_template(tmp_path):
    original = (Path(__file__).resolve().parents[1] /
                "examples" / "fullstack-preview" / "compose.yaml").read_bytes()
    target = tmp_path / "examples" / "fullstack-preview"
    target.mkdir(parents=True)
    (target / "compose.yaml").write_bytes(original)
    manifest = {"sources": {"compose.yaml": hashlib.sha256(original).hexdigest()}}
    class Reviewed:
        reviewed = manifest
        def verify(self, name):
            if name != "alpha":
                raise AdmissionDenied("not a reviewed tenant")
            return target / "compose.yaml"
    return Reviewed(), target, original


def test_derived_compose_is_image_only_and_preserves_approved_template(signed_template):
    approved,folder,original=signed_template
    image_id="sha256:" + "a"*64
    altered=derive_image_only_compose(approved,"alpha",image_id)
    assert image_id.encode() in altered
    assert b"    build:" not in altered
    assert b"    pull_policy: never\n" in altered
    assert b"api:\n    image: sha256:" in altered
    assert b"dockerfile:" not in altered
    assert b"preview-internal:" in altered
    assert b"postgres:16-alpine@sha256:" in altered
    assert b"ingress:" in altered
    assert original == (folder / "compose.yaml").read_bytes()
    for bad in ("python:latest", "sha256:"+("f"*63), "SHA256:"+("a"*64),
                "sha256:"+("A"*64), "", None):
        with pytest.raises(AdmissionDenied,match="local content-addressed"):
            derive_image_only_compose(approved,"alpha",bad)
    with pytest.raises(AdmissionDenied,match="not a reviewed tenant"):
        derive_image_only_compose(approved,"other",image_id)


def test_derived_compose_rejects_original_template_change_and_source_build(signed_template):
    approved,folder,original=signed_template
    image_id="sha256:"+"f"*64
    (folder/"compose.yaml").write_bytes(original+b"\n  injected:\n    build:\n      context: .\n")
    with pytest.raises(AdmissionDenied,match="reviewed digest"):
        derive_image_only_compose(approved,"alpha",image_id)
    (folder/"compose.yaml").write_bytes(
        original.replace(b"dockerfile: Dockerfile.api",
                         b"dockerfile: unreviewed.Dockerfile"))
    with pytest.raises(AdmissionDenied,match="reviewed digest"):
        derive_image_only_compose(approved,"alpha",image_id)


def test_sealed_runtime_bytes_are_kernel_immutable_to_same_uid(signed_template):
    approved,folder,_=signed_template
    raw=derive_image_only_compose(approved,"alpha","sha256:"+"b"*64)
    if not linux_sealing_supported():
        with pytest.raises(AdmissionDenied,match="requires Linux memfd"):
            SealedRuntimeCompose(raw)
        return
    with SealedRuntimeCompose(raw) as document:
        assert document.verify()
        assert document.sha256==hashlib.sha256(raw).hexdigest()
        with document.open_reader() as stream:
            assert stream.read() == raw
        attacker = """
import os,sys,json
fd=int(sys.argv[1])
out={}
for kind,callback in [
    ("write",lambda: os.write(fd,b'EVIL')),
    ("truncate",lambda: os.ftruncate(fd,1)),
]:
    try: callback();out[kind]="ALLOWED"
    except OSError:out[kind]="DENIED"
print(json.dumps(out))
"""
        ran=subprocess.run([sys.executable,"-c",attacker,str(document.fd)],
                           pass_fds=(document.fd,),text=True,
                           capture_output=True,timeout=10,check=False)
        assert ran.returncode==0,ran.stderr
        assert json.loads(ran.stdout)=={"write":"DENIED","truncate":"DENIED"}
        # Even if the reviewed directory is compromised post-seal, Compose
        # can only read immutable previously pinned stdin.
        (folder/"compose.yaml").write_bytes(b"MALICIOUS")
        assert document.verify()
        with document.open_reader() as stream:
            assert stream.read()==raw
        with pytest.raises(AdmissionDenied,match="reviewed digest"):
            derive_image_only_compose(approved,"alpha","sha256:"+"b"*64)
    with pytest.raises(AdmissionDenied,match="descriptor closed"):
        document.verify()


def test_local_engine_image_ID_is_validated_not_a_mutable_tag(monkeypatch):
    image_id="sha256:"+"d"*64
    assert is_local_image_id(image_id)
    monkeypatch.setattr("preview_sealed_runtime.subprocess.run",lambda *a,**k:
                        SimpleNamespace(returncode=0,stdout=image_id+"\n"))
    assert verify_local_image_exists(image_id) is True
    monkeypatch.setattr("preview_sealed_runtime.subprocess.run",lambda *a,**k:
                        SimpleNamespace(returncode=0,stdout="sha256:"+"e"*64))
    with pytest.raises(AdmissionDenied,match="disappeared or changed"):
        verify_local_image_exists(image_id)
    for untrusted in ("reviewed-api:latest", "sha256:../bad", "", None):
        with pytest.raises(AdmissionDenied,match="missing or malformed"):
            verify_local_image_exists(untrusted)


def test_sealed_runtime_image_only_requires_kernel_and_never_falls_back():
    if linux_sealing_supported():
        pytest.skip("Linux kernel sealing available")
    with pytest.raises(AdmissionDenied,match="requires Linux memfd"):
        SealedRuntimeCompose(b"services: {}\n")
