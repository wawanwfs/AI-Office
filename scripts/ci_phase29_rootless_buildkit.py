#!/usr/bin/env python3
"""Single-host, disposable CI fixture for a separate rootless BuildKit daemon."""
import argparse
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import signal
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import time

DOCKER_SOCKET = "/run/docker.sock"
TOOLS = Path("/opt/wfs-phase29/bin")
HOST_PATH = "/usr/bin:/bin"
FULL_SEALS = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL


def check_sealed_context(expected, fd=0):
    """Read the original descriptor, not a pathname or writable copy."""
    if fcntl.fcntl(fd, fcntl.F_GET_SEALS) & FULL_SEALS != FULL_SEALS:
        raise RuntimeError("builder context lacks mandatory kernel seals")
    size = os.fstat(fd).st_size
    if not 1 <= size <= 68 * 1024 * 1024:
        raise RuntimeError("builder context exceeds reviewed bounds")
    digest = hashlib.sha256()
    for offset in range(0, size, 65536):
        data = os.pread(fd, min(size - offset, 65536), offset)
        if not data:
            raise RuntimeError("sealed build context truncated")
        digest.update(data)
    if digest.hexdigest() != expected:
        raise RuntimeError("builder context differs from reviewed digest")
    os.lseek(fd, 0, os.SEEK_SET)


def require_docker_denial():
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(4)
        try:
            client.connect(DOCKER_SOCKET)
        except OSError as exc:
            if exc.errno == errno.EACCES:
                return
            raise
        raise RuntimeError("non-operator identity can connect to runtime Docker")


def demote(account):
    return ["/usr/bin/setpriv", "--reuid", str(account.pw_uid), "--regid",
            str(account.pw_gid), "--clear-groups", "--"]


def peer_identity(endpoint, account, operator_uid):
    if endpoint.is_symlink():
        raise RuntimeError("BuildKit endpoint must not be a symlink")
    meta = endpoint.stat()
    if not stat.S_ISSOCK(meta.st_mode) or meta.st_uid != account.pw_uid:
        raise RuntimeError("BuildKit socket is not owned by the builder")
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(4)
        client.connect(str(endpoint))
        pid, uid, gid = struct.unpack("3i", client.getsockopt(
            socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))
    process = Path("/proc") / str(pid)
    uid_map = [list(map(int, line.split())) for line in (process / "uid_map").read_text().splitlines()]
    if (uid != account.pw_uid or gid != account.pw_gid or uid in (0, operator_uid)
            or not uid_map or uid_map[0] != [0, uid, 1]
            or any(outside <= operator_uid < outside + count or outside == 0
                   for _, outside, count in uid_map)
            or (process / "exe").resolve(strict=True) != TOOLS / "buildkitd"):
        raise RuntimeError("BuildKit listener is not the distinct rootless daemon")
    return uid, gid


def build_child(endpoint, expected):
    require_docker_denial()
    check_sealed_context(expected)
    docker = ["/usr/bin/docker", "buildx"]
    builder = "wfs-isolated"
    subprocess.run(docker + ["create", "--name", builder, "--driver", "remote",
                             "unix://" + endpoint], stdout=sys.stderr, check=True, timeout=25)
    subprocess.run(docker + [
        "build", "--builder", builder, "--platform", "linux/amd64",
        "--provenance=false", "--sbom=false", "--progress=plain",
        "--output", "type=oci,compression=gzip,dest=-",
        "--file", "Dockerfile.api", "-",
    ], check=True, timeout=300)
    check_sealed_context(expected)


def run_fixture(expected):
    if os.geteuid() != 0 or not os.environ.get("SUDO_UID", "").isdigit():
        raise RuntimeError("run only with the explicit disposable CI supervisor")
    operator_uid = int(os.environ["SUDO_UID"])
    sock = Path(DOCKER_SOCKET).stat()
    if not stat.S_ISSOCK(sock.st_mode) or sock.st_uid != 0 or sock.st_mode & 0o007:
        raise RuntimeError("expected restricted operator Docker socket")
    check_sealed_context(expected)
    with tempfile.TemporaryDirectory(prefix="wfs-bk-", dir="/tmp") as tmp:
        root = Path(tmp)
        root.chmod(0o711)
        name = root.name
        home = root / "builder"
        try:
            subprocess.run([
                "/usr/sbin/useradd", "--uid", "27220", "--user-group",
                "--no-log-init", "--no-create-home", "--home-dir", str(home),
                "--shell", "/usr/sbin/nologin", name,
            ], stdin=subprocess.DEVNULL, stdout=sys.stderr, check=True, timeout=60)
            account = pwd.getpwnam(name)
            if account.pw_uid in (0, operator_uid) or account.pw_gid == sock.st_gid:
                raise RuntimeError("builder principal overlaps runtime operator")
            home.mkdir(mode=0o700)
            os.chown(home, account.pw_uid, account.pw_gid)
            helper = root / "build.py"
            shutil.copyfile(__file__, helper)
            helper.chmod(0o444)
            endpoint = home / "buildkit.sock"
            env = {"PATH": f"{TOOLS}:{HOST_PATH}", "HOME": str(home),
                   "USER": name, "LOGNAME": name, "XDG_RUNTIME_DIR": str(home),
                   "DOCKER_CONFIG": str(home / ".docker"),
                   "DOCKER_HOST": "unix:///nonexistent-wfs-builder-docker.sock"}
            daemon_args = [
                "/usr/bin/rootlesskit", "--net=slirp4netns", "--disable-host-loopback",
                "--copy-up=/etc", "--state-dir=" + str(home / "rootlesskit"),
                str(TOOLS / "buildkitd"), "--rootless", "--addr", "unix://" + str(endpoint),
                "--root", str(home / "state"), "--oci-worker-snapshotter=native",
                "--oci-worker-binary", str(TOOLS / "buildkit-runc"),
                "--containerd-worker=false",
            ]
            with tempfile.TemporaryFile() as log:
                daemon = subprocess.Popen(demote(account) + daemon_args, cwd=home,
                                          env=env, stdin=subprocess.DEVNULL,
                                          stdout=log, stderr=log, start_new_session=True)
                try:
                    for _ in range(100):
                        if daemon.poll() is not None:
                            raise RuntimeError("rootless BuildKit exited during startup")
                        if endpoint.is_socket():
                            ready = subprocess.run(demote(account) + [
                                str(TOOLS / "buildctl"), "--addr", "unix://" + str(endpoint),
                                "debug", "workers"], cwd=home, env=env, stdin=subprocess.DEVNULL,
                                capture_output=True, text=True, timeout=6)
                            if ready.returncode == 0 and "linux/amd64" in ready.stdout:
                                break
                        time.sleep(.2)
                    else:
                        raise RuntimeError("rootless BuildKit worker did not become ready")
                    uid, gid = peer_identity(endpoint, account, operator_uid)
                    subprocess.run(demote(account) + [
                        sys.executable, "-I", "-B", str(helper), "--child", str(endpoint),
                        expected], cwd=home, env=env, check=True, timeout=350)
                    check_sealed_context(expected)
                except (OSError, RuntimeError, subprocess.SubprocessError):
                    log.seek(max(0, log.seek(0, os.SEEK_END) - 8000))
                    print(log.read().decode("utf-8", "replace"), file=sys.stderr)
                    raise
                finally:
                    if daemon.poll() is None:
                        os.killpg(daemon.pid, signal.SIGTERM)
                        try:
                            daemon.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            os.killpg(daemon.pid, signal.SIGKILL)
                            daemon.wait(timeout=10)
            print("WFS_ROOTLESS_BUILDKIT " + json.dumps({
                "daemon_uid": uid, "daemon_gid": gid, "client_uid": account.pw_uid,
                "operator_uid": operator_uid, "builder_runtime_socket_denied": True,
                "builder_input_kernel_seals_verified": True,
                "sealed_context_sha256": expected, "dedicated_unix_socket": True,
                "daemon_user_namespace_verified": True, "daemon_stopped": True,
            }), file=sys.stderr)
        finally:
            try:
                pwd.getpwnam(name)
            except KeyError:
                pass
            else:
                subprocess.run(["/usr/sbin/userdel", name], stdin=subprocess.DEVNULL,
                               stdout=sys.stderr, check=True, timeout=30)


def verify_child(root):
    require_docker_denial()
    sys.path.insert(0, str(root))
    from preview_oci_layout import verify_layout

    review = json.loads((root / "review.json").read_text())
    layout = verify_layout(sys.stdin.buffer, frontend=review["frontend"],
                           api_sha256=review["sources"]["api.py"])
    print(json.dumps({"verifier_uid": os.geteuid(), "verifier_runtime_socket_denied": True,
                      "manifest_digest": layout.manifest_digest,
                      "config_digest": layout.config_digest}))


def run_verifier(review):
    if os.geteuid() != 0 or not os.environ.get("SUDO_UID", "").isdigit():
        raise RuntimeError("run only with the explicit disposable CI supervisor")
    verifier_uid = 27212
    if verifier_uid == int(os.environ["SUDO_UID"]):
        raise RuntimeError("verifier principal overlaps operator")
    try:
        pwd.getpwuid(verifier_uid)
    except KeyError:
        pass
    else:
        raise RuntimeError("expected an unused verifier UID")
    with tempfile.TemporaryDirectory(prefix="wfs-bk-verify-", dir="/tmp") as tmp:
        root = Path(tmp)
        root.chmod(0o755)
        backend = Path(__file__).resolve().parents[1] / "backend"
        for src in (Path(__file__), backend / "preview_oci_layout.py",
                    backend / "preview_admission_v2.py"):
            dst = root / src.name
            shutil.copyfile(src, dst)
            dst.chmod(0o444)
        (root / "review.json").write_text(review)
        (root / "review.json").chmod(0o444)
        # The archive arrives on an already-open read-only fd. No path or key
        # belonging to the operator is made available to the verifier.
        if fcntl.fcntl(0, fcntl.F_GETFL) & os.O_ACCMODE != os.O_RDONLY:
            raise RuntimeError("verifier requires a read-only OCI descriptor")
        subprocess.run(["/usr/bin/setpriv", "--reuid", str(verifier_uid),
                        "--regid", str(verifier_uid), "--clear-groups", "--no-new-privs",
                        "--", sys.executable, "-I", "-B", str(root / Path(__file__).name),
                        "--verify-child", str(root)], cwd=root, env={"PATH": HOST_PATH},
                       check=True, timeout=90)


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--child":
        build_child(*sys.argv[2:])
        return
    if len(sys.argv) == 3 and sys.argv[1] == "--verify-child":
        verify_child(Path(sys.argv[2]))
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disposable-ci", action="store_true", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--context-sha256")
    mode.add_argument("--verify-review")
    options = parser.parse_args()
    if options.context_sha256:
        run_fixture(options.context_sha256)
    else:
        run_verifier(options.verify_review)


if __name__ == "__main__":
    main()
