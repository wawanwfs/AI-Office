"""CI-only hashed Python wheelhouse proof for the preview signing dependency.

Download from configured index on a disposable runner, generate an ephemeral
SHA256 lock for ALL resolved wheels, install with --no-index --require-hashes,
then prove a modified wheel is rejected. NOT independently signed package
provenance or a production reproducible/offline Docker build.
"""
import hashlib
import json
from email.parser import BytesParser
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

REPO = Path(__file__).resolve().parents[1]
TARGET = REPO / "artifacts" / "phase10-supply-chain"
TARGET.mkdir(parents=True, exist_ok=True)


def run(args):
    return subprocess.run(
        [sys.executable, "-m", "pip", *map(str, args)],
        capture_output=True, text=True, timeout=240, check=False,
    )


def metadata(wheel):
    with zipfile.ZipFile(wheel) as archive:
        meta_files = [item for item in archive.namelist()
                      if item.endswith(".dist-info/METADATA")]
        if len(meta_files) != 1:
            raise AssertionError("ambiguous Python wheel metadata")
        info = BytesParser().parsebytes(archive.read(meta_files[0]))
    name, version = info.get("Name"), info.get("Version")
    if (not name or not version or len(name) > 96 or len(version) > 96
            or not all(c.isalnum() or c in "-_." for c in name + version)):
        raise AssertionError("invalid downloaded wheel package metadata")
    return name, version


with tempfile.TemporaryDirectory(prefix="wfs-crypto-wheelhouse-") as scratch:
    root = Path(scratch)
    wheels = root / "wheels"
    wheels.mkdir()
    download = run([
        "download", "--only-binary=:all:", "--no-cache-dir",
        "--dest", wheels, "--requirement", REPO / "requirements-preview-crypto.txt",
    ])
    if download.returncode:
        raise SystemExit("disposable CI wheel resolution failed")
    inventory = {}
    for wheel in wheels.glob("*.whl"):
        name, version = metadata(wheel)
        key = name.casefold().replace("_", "-")
        if key in inventory:
            raise AssertionError("duplicate resolved wheel: " + key)
        inventory[key] = {
            "name": name, "version": version,
            "sha256": hashlib.sha256(wheel.read_bytes()).hexdigest(),
            "filename": wheel.name,
        }
    if "cryptography" not in inventory or len(inventory) < 2:
        raise AssertionError("missing preview crypto transitive dependencies")
    lock = root / "wheelhouse-hashes.txt"
    lock.write_text("".join(
        "{name}=={version} --hash=sha256:{sha256}\n".format(**entry)
        for entry in sorted(inventory.values(), key=lambda x:x["name"].casefold())
    ))
    installed = run([
        "install", "--no-index", "--no-cache-dir", "--find-links", wheels,
        "--require-hashes", "--only-binary=:all:",
        "--target", root / "installed", "-r", lock,
    ])
    if installed.returncode:
        raise SystemExit("verified offline wheelhouse install failed")

    # A tampered file must be detected by pip's hash verification.
    entry = next(iter(inventory.values()))
    wheel = wheels / entry["filename"]
    wheel.write_bytes(wheel.read_bytes() + b"INVALID-SUPPLY-CHAIN-MUTATION")
    tampered = run([
        "install", "--no-index", "--no-cache-dir", "--find-links", wheels,
        "--require-hashes", "--only-binary=:all:",
        "--target", root / "tampered", "-r", lock,
    ])
    if tampered.returncode == 0:
        raise AssertionError("tampered wheel was accepted despite hash lock")

    report = {
        "mode": "disposable-CI-only-wheelhouse",
        "wheel_count": len(inventory),
        "resolved_wheels": [inventory[x] for x in sorted(inventory)],
        "all_transitive_wheels_pinned_by_sha256": True,
        "install_no_index": True,
        "pip_require_hashes": True,
        "tampered_wheel_rejected": True,
        "operator_independent_provenance": False,
        "all_repo_python_js_dependencies_covered": False,
        "production_docker_build_offline": False,
    }
    (TARGET / "preview-crypto-wheelhouse.json").write_text(
        json.dumps(report, indent=2, sort_keys=True))
    print(json.dumps({key: value for key, value in report.items()
                      if key != "resolved_wheels"}, sort_keys=True))
