"""Disposable hosted-runner systemd and Docker acceptance for the preview lease."""
import os
from pathlib import Path
import subprocess
import sys
import time

import httpx

from preview_proxy import PreviewProxyUnavailable


def _command(*args, timeout=25):
    result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"{args[0]} command failed: {result.stderr[-2000:]}")
    return result.stdout.strip()


def _ctl(*args):
    return _command("sudo", "-n", "systemctl", *args)


def _wait(test, description, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if result := test():
            return result
        time.sleep(.15)
    raise AssertionError(description)


def prove_systemd_preview(*, cli, token, project, port, state, registry, reader,
                          check_health, neighbor_check):
    """Exercise actual units. Never run this against a persistent host."""
    user = _command("id", "-un")
    group = _command("id", "-gn")
    units = ["wfs-phase32-start-" + str(os.getpid()),
             "wfs-phase32-recover-" + str(os.getpid())]

    def launch(unit, action, *extra, restart="no"):
        _command("sudo", "-n", "systemd-run", "--quiet", "--unit", unit,
                 "--uid", user, "--gid", group, "--property=SupplementaryGroups=docker",
                 "--property=Type=exec", "--property=KillMode=control-group",
                 "--property=Restart=" + restart, "--property=RestartSec=1s",
                 "--property=TimeoutStopSec=5s", "--working-directory", str(state),
                 sys.executable, str(state / "phase32-exec.py"), action, *cli, *extra)

    def pid(unit):
        return int(_ctl("show", "-p", "MainPID", "--value", unit))

    def deadline():
        return registry(project)["lease_deadline"]

    def denied():
        try:
            reader.port(project)
        except PreviewProxyUnavailable:
            return True
        return False

    def reachable():
        try:
            return reader.port(project) == port
        except PreviewProxyUnavailable:
            return False

    # The unit receives no token in argv or systemd properties. The CI startup
    # wrapper reads a private ephemeral file; recovery never needs that file.
    secret = state / "phase32-token"
    wrapper = state / "phase32-exec.py"
    with secret.open("x") as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(token)
    operator = Path(__file__).with_name("wfs_operator_preview.py").resolve()
    wrapper.write_text(
        "import os, sys\nfrom pathlib import Path\n"
        "if sys.argv[1] == 'start-supervised':\n"
        "    os.environ['WFS_PREVIEW_TEST_TOKEN'] = Path(__file__).with_name('phase32-token').read_text()\n"
        f"os.execv(sys.executable, [sys.executable, {str(operator)!r}, *sys.argv[1:]])\n")
    try:
        launch(units[0], "start-supervised", "--port", str(port))
        _wait(reachable, "systemd startup never admitted a signed lease", timeout=55)
        assert check_health()
        record = registry(project)
        api = record["api_container_id"]
        assert record["lease_boot_id"]
        database = _command("docker", "ps", "-q", "--filter",
                            "label=com.docker.compose.project=" + record["compose_name"],
                            "--filter", "label=com.docker.compose.service=db")

        def sql(query):
            return _command("docker", "exec", database, "psql", "-U", "wfsdemo",
                            "-d", "wfsdemo", "-Atq", "-c", query)

        sql("CREATE TABLE phase32_probe (value integer); INSERT INTO phase32_probe VALUES (32)")
        _ctl("stop", units[0])
        assert not pid(units[0])
        secret.unlink()
        first = deadline()
        launch(units[1], "recover-supervised", restart="on-failure")
        _wait(lambda: deadline() > first, "recovery-only unit never renewed")
        previous_pid = pid(units[1])
        assert previous_pid > 1
        before_crash = deadline()
        _ctl("kill", "--kill-who=all", "--signal=SIGKILL", units[1])
        _wait(lambda: (current := pid(units[1])) > 1 and current != previous_pid,
              "systemd did not replace the entire supervisor")
        _wait(lambda: deadline() > before_crash, "replacement supervisor never renewed")
        assert int(_ctl("show", "-p", "NRestarts", "--value", units[1])) >= 1
        assert registry(project)["api_container_id"] == api and check_health()
        neighbor_check()

        _ctl("stop", units[1])
        _wait(denied, "gateway still admitted an elapsed lease")
        assert registry(project)["phase"] == "running"
        launch(units[1], "recover-supervised", restart="on-failure")
        _wait(lambda: registry(project)["phase"] == "stopped",
              "recovery-only unit did not suspend the expired preview")
        final = registry(project)
        assert final["lease_deadline"] == 0 and final["lease_suspended"] == 1
        assert final["api_container_id"] == api and denied()
        assert sql("SELECT value FROM phase32_probe") == "32"
        neighbor_check()
        with httpx.Client(timeout=1, trust_env=False) as client:
            try:
                client.get(f"http://127.0.0.1:{port}/api/health").raise_for_status()
                raise AssertionError("elapsed preview still reachable after systemd recovery")
            except (httpx.TransportError, httpx.HTTPStatusError):
                pass
        return {"systemd_supervisor_sigkill_recovered": True,
                "same_api_container_after_recovery": True,
                "elapsed_lease_denied_and_suspended": True,
                "postgres_row_and_neighbor_preserved": True,
                "boot_identity_recorded": True, "host_reboot_exercised": False}
    except (AssertionError, OSError, RuntimeError, subprocess.SubprocessError):
        for unit in units:
            result = subprocess.run(["sudo", "-n", "journalctl", "-u", unit,
                                     "--no-pager", "-n", "30"],
                                    capture_output=True, text=True, timeout=12)
            print(result.stdout[-6000:], file=sys.stderr)
        raise
    finally:
        for unit in units:
            subprocess.run(["sudo", "-n", "systemctl", "stop", unit],
                           capture_output=True, timeout=12, check=False)
        secret.unlink(missing_ok=True)
        wrapper.unlink(missing_ok=True)
