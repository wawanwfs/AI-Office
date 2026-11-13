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
