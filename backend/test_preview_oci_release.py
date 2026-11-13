"""Self-contained validation of the Phase 23 OCI verifier and approval pins."""
import base64
import gzip
import io
import json
import tarfile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import pytest

from preview_admission_v2 import AdmissionDenied
from preview_oci_approval import approval_message, frontend_sha256, verify_release
from preview_oci_layout import PLATFORM, sha256, verify_layout
from preview_signature import canonical_review_bytes

PREFIX = "application/vnd.oci.image."
INDEX = PREFIX + "index.v1+json"
MANIFEST = PREFIX + "manifest.v1+json"
CONFIG = PREFIX + "config.v1+json"
LAYER = PREFIX + "layer.v1.tar+gzip"
NOW = 1_800_000_000
FILES = {"index.html": b"reviewed index", "assets/app.js": b"reviewed script"}
API = b"print('approved preview')"


def encoded(value):
    return json.dumps(value, sort_keys=True).encode("utf-8")


def tar_bytes(members):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w") as archive:
        for name, data in members:
            member = tarfile.TarInfo(name)
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    return out.getvalue()


def image(path, *, arch="amd64", index_arch="amd64", fault=None,
          asset_content=None, description=None):
    entries = [("oci-layout", encoded({"imageLayoutVersion": "1.0.0"}))]
    if asset_content is None:
        asset_content = FILES
    content = [("app/dist/" + k, v) for k, v in asset_content.items()]
    if fault == "whiteout":
        content.append(("app/.wh.api.py", b""))
    layers = [tar_bytes([("app/api.py", API)]), tar_bytes(content)]
    if fault == "hidden_lower_asset":
        layers[0] = tar_bytes([("app/api.py", API), ("app/dist/extra.js", b"extra")])

    def blob(media, data, *, corrupt=False):
        digest = sha256(data)
        entries.append(("blobs/sha256/" + digest,
                        data[:-1] + bytes([data[-1] ^ 1]) if corrupt else data))
        return {"mediaType": media, "digest": "sha256:" + digest, "size": len(data)}

    layer_refs = [blob(LAYER, gzip.compress(layer, mtime=0),
                       corrupt=fault == "layer_digest" and i == 0)
                  for i, layer in enumerate(layers)]
    diff_ids = ["sha256:" + sha256(layer) for layer in layers]
    if fault == "diff_id":
        diff_ids[-1] = "sha256:" + "0" * 64
    config = {"os": "linux", "architecture": arch,
              "rootfs": {"type": "layers", "diff_ids": diff_ids}}
    if description is not None:
        config["config"] = {"Labels": {"build": description}}
    config_ref = blob(CONFIG, encoded(config), corrupt=fault == "config_digest")
    manifest = blob(MANIFEST, encoded({
        "schemaVersion": 2, "config": config_ref, "layers": layer_refs,
    }), corrupt=fault == "manifest_digest")
    if index_arch is not None:
        manifest["platform"] = {"os": "linux", "architecture": index_arch}
    if fault == "descriptor_size":
        manifest["size"] += 1
    if fault == "remote_url":
        manifest["urls"] = ["https://example.invalid/asset"]
    entries.append(("index.json", encoded({
        "schemaVersion": 2, "mediaType": INDEX, "manifests": [manifest],
    })))
    if fault == "duplicate":
        entries.append(entries[-1])
    if fault == "unsafe_archive":
        entries.append(("../unexpected", b"unreviewed data"))
    path.write_bytes(tar_bytes(entries))
    return manifest["digest"], config_ref["digest"]


def review():
    return {"version": 2, "sources": {"api.py": sha256(API)},
            "frontend": {k: sha256(v) for k, v in FILES.items()}}


@pytest.fixture
def candidate(tmp_path):
    archive = tmp_path / "image.tar"
    manifest, config = image(archive)
    return archive, manifest, config


@pytest.fixture
def signed(tmp_path, candidate):
    archive, manifest, _ = candidate
    material = review()
    review_digest = sha256(canonical_review_bytes(material))
    review_path = tmp_path / "review.json"
    review_path.write_bytes(encoded(material))
    witness = Ed25519PrivateKey.generate()
    public = witness.public_key()
    key_path = tmp_path / "witness.pem"
    key_path.write_bytes(public.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    fingerprint = sha256(public.public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw))
    approval_path, signature_path = tmp_path / "approval.json", tmp_path / "approval.sig"
    args = dict(archive=archive, review_path=review_path, approval_path=approval_path,
                signature_path=signature_path, witness_key_path=key_path,
                trusted_witness_fingerprint=fingerprint,
                trusted_reviewer_fingerprint="a" * 64,
                trusted_review_sha256=review_digest, now=NOW)

    def sign(**changes):
        record = {"version": 1, "manifest_digest": manifest, "platform": PLATFORM,
                  "review_sha256": review_digest,
                  "frontend_sha256": frontend_sha256(material["frontend"]),
                  "issued_at": NOW - 5, "expires_at": NOW + 100, **changes}
        raw = encoded(record)
        approval_path.write_bytes(raw)
        signature_path.write_bytes(base64.b64encode(witness.sign(approval_message(raw))))
        return sha256(raw)

    args["trusted_approval_sha256"] = sign()
    return args, sign


def test_accepts_exact_signed_image_and_separate_digests(candidate, signed):
    args, _ = signed
    result = verify_release(**args)
    assert (result.manifest_digest, result.config_digest) == candidate[1:]
    assert result.manifest_digest != result.config_digest
    assert (result.platform, result.layer_count, result.asset_count) == (PLATFORM, 2, 2)


@pytest.mark.parametrize(("fault", "message"), [
    ("manifest_digest", "blob digest mismatch"),
    ("config_digest", "blob digest mismatch"),
    ("layer_digest", "blob digest mismatch"),
    ("diff_id", "DiffID mismatch"),
    ("descriptor_size", "descriptor size mismatch"),
    ("remote_url", "invalid OCI descriptor"),
    ("duplicate", "duplicate or excessive"),
    ("unsafe_archive", "unsafe OCI tar member path"),
    ("whiteout", "whiteout affects"),
    ("hidden_lower_asset", "final COPY inventory"),
])
def test_rejects_invalid_oci_bytes(tmp_path, fault, message):
    archive = tmp_path / "image.tar"
    image(archive, fault=fault)
    with pytest.raises(AdmissionDenied, match=message):
        verify_layout(archive, frontend=review()["frontend"], api_sha256=sha256(API))


@pytest.mark.parametrize("options", [{"arch": "arm64"}, {"index_arch": "arm64"}])
def test_rejects_index_or_config_platform_mismatch(tmp_path, options):
    archive = tmp_path / "image.tar"
    image(archive, **options)
    with pytest.raises(AdmissionDenied, match="platform mismatch"):
        verify_layout(archive, frontend=review()["frontend"], api_sha256=sha256(API))


@pytest.mark.parametrize("assets", [
    {"index.html": b"replacement", "assets/app.js": FILES["assets/app.js"]},
    {"index.html": FILES["index.html"]},
    {**FILES, "unreviewed.js": b"extra"},
])
def test_rejects_rehashed_but_unreviewed_frontend(tmp_path, assets):
    archive = tmp_path / "image.tar"
    image(archive, asset_content=assets)
    with pytest.raises(AdmissionDenied, match="final COPY inventory"):
        verify_layout(archive, frontend=review()["frontend"], api_sha256=sha256(API))


@pytest.mark.parametrize(("changes", "message"), [
    ({"issued_at": NOW - 100, "expires_at": NOW}, "approval stale"),
    ({"issued_at": NOW + 10}, "approval stale"),
    ({"expires_at": NOW + 90_000}, "approval stale"),
    ({"platform": "linux/arm64"}, "fields or platform"),
    ({"frontend_sha256": "0" * 64}, "reviewed frontend inventory"),
    ({"review_sha256": "0" * 64}, "current reviewed source"),
])
def test_rejects_validly_signed_but_invalid_approvals(signed, changes, message):
    args, sign = signed
    args["trusted_approval_sha256"] = sign(**changes)
    with pytest.raises(AdmissionDenied, match=message):
        verify_release(**args)


def test_rejects_previous_valid_approval_with_new_current_pin(signed):
    args, sign = signed
    old = args["approval_path"].read_bytes()
    old_sig = args["signature_path"].read_bytes()
    args["trusted_approval_sha256"] = sign(expires_at=NOW + 300)
    args["approval_path"].write_bytes(old)
    args["signature_path"].write_bytes(old_sig)
    with pytest.raises(AdmissionDenied, match="pinned current approval"):
        verify_release(**args)


def test_rejects_same_reviewer_or_unpinned_witness(signed):
    args, _ = signed
    with pytest.raises(AdmissionDenied, match="distinct from source reviewer"):
        verify_release(**{**args, "trusted_reviewer_fingerprint": args["trusted_witness_fingerprint"]})
    with pytest.raises(AdmissionDenied, match="fingerprint mismatch"):
        verify_release(**{**args, "trusted_witness_fingerprint": "0" * 64})


@pytest.mark.parametrize("missing", ["approval_path", "signature_path"])
def test_rejects_missing_evidence(signed, missing):
    args, _ = signed
    args[missing].unlink()
    with pytest.raises(AdmissionDenied, match="signature or reviewer public-key path"):
        verify_release(**args)


def test_rejects_invalid_detached_signature(signed):
    args, _ = signed
    args["signature_path"].write_bytes(base64.b64encode(b"0" * 64))
    with pytest.raises(AdmissionDenied, match="witness signature mismatch"):
        verify_release(**args)


def test_rejects_substituted_but_valid_oci_image_with_same_reviewed_files(signed):
    args, _ = signed
    image(args["archive"], description="different OCI manifest")
    with pytest.raises(AdmissionDenied, match="manifest digest differs"):
        verify_release(**args)


def test_optional_index_platform_still_requires_verified_config(tmp_path):
    archive = tmp_path / "image.tar"
    image(archive, index_arch=None)
    assert verify_layout(archive, frontend=review()["frontend"],
                         api_sha256=sha256(API)).platform == PLATFORM
    image(archive, index_arch=None, arch="arm64")
    with pytest.raises(AdmissionDenied, match="config platform mismatch"):
        verify_layout(archive, frontend=review()["frontend"], api_sha256=sha256(API))


def promotion(args, **overrides):
    from preview_oci_promotion import ApprovedOCIRelease
    return ApprovedOCIRelease(**{
        "archive_path": args["archive"], "approval_path": args["approval_path"],
        "signature_path": args["signature_path"], "witness_key_path": args["witness_key_path"],
        "approval_sha256": args["trusted_approval_sha256"],
        "witness_fingerprint": args["trusted_witness_fingerprint"],
        **overrides,
    })


def test_promotion_reads_verified_sealed_bytes_not_mutable_archive(signed, monkeypatch):
    import errno
    import os

    from preview_oci_promotion import load_verified_image
    from preview_sealed_build import linux_sealing_supported
    if not linux_sealing_supported():
        pytest.skip("Linux kernel seals required")
    args, sign = signed
    import time
    now = int(time.time())
    args["trusted_approval_sha256"] = sign(issued_at=now - 10, expires_at=now + 600)
    release = promotion(args)
    source_bytes = args["archive"].read_bytes()
    calls = []

    def docker(binary, argv, *, stdin=None, timeout=25):
        calls.append((binary, argv))
        if argv[:2] == ["image", "load"]:
            with pytest.raises(OSError) as denied:
                os.pwrite(stdin.fileno(), b"x", 0)
            assert denied.value.errno == errno.EPERM
            with tarfile.open(fileobj=stdin, mode="r:") as transport:
                manifest = json.loads(transport.extractfile("manifest.json").read())
                assert manifest[0]["RepoTags"] == []
                assert [manifest[0]["Config"], *manifest[0]["Layers"]] == [
                    "config.json", "layer-0.tar", "layer-1.tar"]
                names = [manifest[0]["Config"], *manifest[0]["Layers"]]
                hashes = [checked.config_digest, *checked.layer_digests]
                for name, expected in zip(names, hashes):
                    assert "sha256:" + sha256(transport.extractfile(name).read()) == expected
        else:
            from types import SimpleNamespace
            assert argv[-1] == checked.config_digest
            return SimpleNamespace(stdout=encoded({
                "Id": checked.config_digest, "Os": "linux", "Architecture": "amd64",
                "RootFS": {"Type": "layers", "Layers": list(checked.diff_ids)},
            }))

    monkeypatch.setattr("preview_oci_promotion._docker", docker)
    with release.open_verified(review(), "a" * 64) as (snapshot, checked, archive_sha):
        assert archive_sha == sha256(source_bytes)
        with pytest.raises(OSError) as denied:
            os.pwrite(snapshot.fileno(), b"x", 0)
        assert denied.value.errno == errno.EPERM
        args["archive"].write_bytes(b"unapproved replacement")
        load_verified_image("docker", snapshot, checked)
    assert [argv[:2] for _, argv in calls] == [["image", "load"], ["image", "inspect"]]


def test_promotion_rejects_valid_old_approval_against_current_pin(signed):
    import time

    from preview_sealed_build import linux_sealing_supported
    if not linux_sealing_supported():
        pytest.skip("Linux kernel seals required")
    args, sign = signed
    now = int(time.time())
    sign(issued_at=now - 10, expires_at=now + 600)
    old_record = args["approval_path"].read_bytes()
    old_sig = args["signature_path"].read_bytes()
    current = sign(issued_at=now - 5, expires_at=now + 700)
    release = promotion(args, approval_sha256=current)
    args["approval_path"].write_bytes(old_record)
    args["signature_path"].write_bytes(old_sig)
    with pytest.raises(AdmissionDenied, match="pinned current approval"):
        with release.open_verified(review(), "a" * 64):
            pytest.fail("superseded release was opened")


def test_promotion_native_host_never_opens_archive(signed, monkeypatch):
    args, _ = signed
    args["archive"].unlink()
    monkeypatch.setattr("preview_oci_promotion.linux_sealing_supported", lambda: False)
    with pytest.raises(AdmissionDenied, match="requires Linux memfd"):
        with promotion(args).open_verified(review(), "a" * 64):
            pytest.fail("unsupported host opened an OCI archive")


@pytest.mark.parametrize("wrong", ["config", "platform", "diff_ids"])
def test_rejects_mismatched_docker_image(wrong, candidate, monkeypatch):
    from preview_oci_promotion import verify_engine_image
    checked = verify_layout(candidate[0], frontend=review()["frontend"], api_sha256=sha256(API))
    details = {"Id": checked.config_digest, "Os": "linux", "Architecture": "amd64",
               "RootFS": {"Type": "layers", "Layers": list(checked.diff_ids)}}
    if wrong == "config":
        details["Id"] = checked.manifest_digest
    elif wrong == "platform":
        details["Architecture"] = "arm64"
    else:
        details["RootFS"]["Layers"].reverse()
    monkeypatch.setattr("preview_oci_promotion._inspect", lambda *args: details)
    with pytest.raises(AdmissionDenied, match="config and DiffIDs"):
        verify_engine_image("docker", checked)


@pytest.mark.parametrize("wrong", ["image", "project", "mount", "runtime_id", "stopped"])
def test_rejects_mismatched_running_container(wrong, candidate, monkeypatch):
    from preview_oci_promotion import verify_api_container
    checked = verify_layout(candidate[0], frontend=review()["frontend"], api_sha256=sha256(API))
    runtime_id = "b" * 64
    details = {"Id": runtime_id, "Image": checked.config_digest,
               "Config": {"Labels": {"com.docker.compose.project": "alpha",
                                     "com.docker.compose.service": "api"}},
               "HostConfig": {"ReadonlyRootfs": True}, "State": {"Running": True}, "Mounts": []}
    if wrong == "image":
        details["Image"] = checked.manifest_digest
    elif wrong == "project":
        details["Config"]["Labels"]["com.docker.compose.project"] = "bravo"
    elif wrong == "mount":
        details["Mounts"] = [{"Type": "bind", "Destination": "/app/dist"}]
    elif wrong == "runtime_id":
        details["Id"] = "c" * 64
    else:
        details["State"]["Running"] = False
    monkeypatch.setattr("preview_oci_promotion._inspect", lambda *args: details)
    with pytest.raises(AdmissionDenied, match="does not match approved OCI release"):
        verify_api_container("docker", runtime_id, "alpha", checked)
