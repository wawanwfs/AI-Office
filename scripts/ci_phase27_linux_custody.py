#!/usr/bin/env python3
"""Disposable Linux CI proof using real UID/GID changes and the local daemon.

The privileged CI supervisor provisions the fixture. It is not a runtime
principal, and this proof does not restrict the host administrator.
"""
import argparse
import errno
import json
import os
from pathlib import Path
import shutil
import socket
import stat
import subprocess
import sys
import tempfile

SOCKET = "/run/docker.sock"
ROLES = ("writer", "builder", "verifier", "gateway", "task")


def attempt(call):
    try:
        result = call()
        if hasattr(result, "close"):
            result.close()
        return "allowed"
    except OSError as exc:
        if exc.errno != errno.EACCES:
            raise
        return "denied"


def ping():
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(4)
        client.connect(SOCKET)
        client.sendall(b"GET /_ping HTTP/1.0\r\nHost: localhost\r\n\r\n")
        with client.makefile("rb") as response:
            raw = response.read(8192)
        if not raw.startswith((b"HTTP/1.0 200", b"HTTP/1.1 200")) or raw.split(b"\r\n\r\n")[-1].strip() != b"OK":
            raise RuntimeError("Docker daemon did not return its expected ping")


def child(root, role):
    result = {"uid": os.geteuid(), "gid": os.getegid(), "groups": os.getgroups(),
              "docker_ping": attempt(ping),
              "client_key_read": attempt(lambda: (root / "keys/client.pem").read_bytes()),
              "writer_input_read": attempt(lambda: (root / "input/source").read_bytes()),
              "writer_input_write": attempt(lambda: (root / "input/source").open("ab")),
              "builder_output_write": attempt(lambda: (root / "build/context").open("ab")),
              "approved_archive_read": attempt(lambda: (root / "release/reviewed-preview.oci.tar").open("rb")),
              "approved_archive_write": attempt(lambda: (root / "release/reviewed-preview.oci.tar").open("ab"))}
    if role == "builder":
        sys.path.insert(0, str(root / "backend"))
        from preview_admission_v2 import ReviewedPreviewAdmission
        from preview_sealed_build import seal_reviewed_preview_context
        stage = root / "build/staged/examples/fullstack-preview"

        class ReviewedStage:
            reviewed = json.loads((root / "build/review.json").read_text())

            def verify(self, _):
                ReviewedPreviewAdmission(stage, self.reviewed).verify()
                return stage / "compose.yaml"

        assert (root / "input/source").read_bytes() == (stage / "api.py").read_bytes()
        with seal_reviewed_preview_context(ReviewedStage(), "phase27") as sealed:
            assert sealed.verify()
            result["sealed_build_context_sha256"] = sealed.tar_sha256
    if role == "verifier":
        sys.path.insert(0, str(root / "backend"))
        from preview_oci_approval import verify_release
        release = root / "release"
        pins = json.loads((release / "pins.json").read_text())
        checked = verify_release(
            release / "reviewed-preview.oci.tar", review_path=release / "review.json",
            approval_path=release / "approval.json", signature_path=release / "approval.sig",
            witness_key_path=release / "witness.pem", **pins)
        result["verified_oci_manifest"] = checked.manifest_digest
    print(json.dumps(result))


def run_fixture(args):
    if sys.platform != "linux" or os.geteuid() != 0 or not args.disposable_ci:
        raise RuntimeError("requires explicit disposable Linux CI provisioning")
    sock = Path(SOCKET).stat()
    if not stat.S_ISSOCK(sock.st_mode) or sock.st_uid != 0 or sock.st_mode & 0o007:
        raise RuntimeError("expected root-owned Docker socket without world access")
    if args.operator_uid <= 0 or sock.st_gid not in args.operator_groups:
        raise RuntimeError("expected unprivileged CI operator in the daemon socket group")
    ids = dict(zip(ROLES, range(27200, 27200 + len(ROLES))))
    assert args.operator_uid not in ids.values() and sock.st_gid not in ids.values()
    with tempfile.TemporaryDirectory(prefix="wfs-phase27-") as tmp:
        root = Path(tmp)
        root.chmod(0o755)

        def directory(name, uid, gid, mode):
            path = root / name
            path.mkdir()
            os.chown(path, uid, gid)
            path.chmod(mode)
            return path

        def copy(src, target, uid=0, gid=0, mode=0o444):
            shutil.copyfile(src, target)
            os.chown(target, uid, gid)
            target.chmod(mode)

        inputs = directory("input", ids["writer"], ids["builder"], 0o750)
        copy(args.source, inputs / "source", ids["writer"], ids["builder"], 0o640)
        build = directory("build", ids["builder"], ids["builder"], 0o700)
        copy(args.source, build / "context", ids["builder"], ids["builder"], 0o600)
        copy(args.release / "review.json", build / "review.json")
        stage = build / "staged"
        shutil.copytree(args.staged, stage)
        stage.chmod(0o755)  # original operator stage root is 0700
        shutil.copyfile(inputs / "source", stage / "examples/fullstack-preview/api.py.tmp")
        os.replace(stage / "examples/fullstack-preview/api.py.tmp",
                   stage / "examples/fullstack-preview/api.py")
        (stage / "examples/fullstack-preview/api.py").chmod(0o444)
        keys = directory("keys", args.operator_uid, args.operator_gid, 0o700)
        copy(args.client_key, keys / "client.pem", args.operator_uid, args.operator_gid, 0o600)
        release = directory("release", 0, ids["verifier"], 0o750)
        for name in ("reviewed-preview.oci.tar", "review.json", "approval.json",
                     "approval.sig", "witness.pem", "pins.json"):
            copy(args.release / name, release / name, gid=ids["verifier"], mode=0o440)
        # The operator's original artifact is separate. The verifier gets
        # read-only copies and no signing material.
        backend = directory("backend", 0, 0, 0o755)
        for module in args.backend.glob("*.py"):
            if not module.name.startswith("test_"):
                copy(module, backend / module.name)
        copy(Path(__file__), root / "probe.py")
        results = {}
        for role in (*ROLES, "operator"):
            uid = args.operator_uid if role == "operator" else ids[role]
            gid = args.operator_gid if role == "operator" else ids[role]
            groups = (["--groups", ",".join(map(str, args.operator_groups))]
                      if role == "operator" else ["--clear-groups"])
            run = subprocess.run(
                ["setpriv", "--reuid", str(uid), "--regid", str(gid), *groups,
                 "--no-new-privs", "--", sys.executable, "-I", "-B",
                 str(root / "probe.py"), "--child", str(root), role],
                cwd=root, env={"PATH": os.defpath}, capture_output=True, text=True, timeout=30)
            if run.returncode:
                raise RuntimeError(f"{role} probe failed: {run.stderr[-2500:]}")
            result = json.loads(run.stdout)
            assert (result["uid"], result["gid"]) == (uid, gid)
            assert result["docker_ping"] == ("allowed" if role == "operator" else "denied")
            assert result["client_key_read"] == ("allowed" if role == "operator" else "denied")
            assert result["writer_input_read"] == ("allowed" if role in ("writer", "builder") else "denied")
            assert result["writer_input_write"] == ("allowed" if role == "writer" else "denied")
            assert result["builder_output_write"] == ("allowed" if role == "builder" else "denied")
            assert result["approved_archive_read"] == ("allowed" if role == "verifier" else "denied")
            assert result["approved_archive_write"] == "denied"
            results[role] = result
        return {"roles": results, "runtime_socket_mode": oct(stat.S_IMODE(sock.st_mode)),
                "runtime_socket_gid": sock.st_gid, "single_host": True,
                "builder_runs_daemon": False, "host_root_in_trust_boundary": True}


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--child":
        child(Path(sys.argv[2]), sys.argv[3])
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disposable-ci", action="store_true")
    for name in ("source", "client-key", "release", "backend", "staged"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--operator-uid", type=int, required=True)
    parser.add_argument("--operator-gid", type=int, required=True)
    parser.add_argument("--operator-groups", type=int, nargs="+", required=True)
    print(json.dumps(run_fixture(parser.parse_args()), sort_keys=True))


if __name__ == "__main__":
    main()
