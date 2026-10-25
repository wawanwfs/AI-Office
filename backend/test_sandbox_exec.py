"""Unit test untuk modul sandbox_exec.py (backend WFS AI-Office).

Sengaja mem-mock subprocess.run supaya TIDAK menyentuh Docker nyata:
semua interaksi container (docker ps / docker exec) disimulasikan.
SANDBOX_BASE di-redirect ke tmp_path agar tidak menulis ke ~/wfs-office/sandboxes.
"""
import pathlib
import subprocess

import pytest

import sandbox_exec


class _FakeProc:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


@pytest.fixture
def fake_docker(tmp_path, monkeypatch):
    """Pasang monk subprocess.run + arahkan SANDBOX_BASE ke tmp_path."""
    monkeypatch.setattr(sandbox_exec, "SANDBOX_BASE", str(tmp_path))
    calls = []
    running = {"containers": set(), "exec_result": _FakeProc()}

    def fake_run(args, **kwargs):
        calls.append((list(args), kwargs))
        if args[0] == "docker" and args[1] == "ps":
            # daftar container hidup
            return _FakeProc(stdout="".join(n + "\n" for n in running["containers"]))
        if args[0] == "docker" and args[1] == "exec":
            if "timeout" in kwargs and isinstance(running["exec_result"], subprocess.TimeoutExpired):
                raise running["exec_result"]
            return running["exec_result"]
        raise AssertionError(f"perintah tak terduga: {args}")

    monkeypatch.setattr(subprocess, "run", fake_run)
    return calls, running


def _mkdir_workspace(base, agent_id):
    ws = pathlib.Path(base) / agent_id / "workspace"
    ws.mkdir(parents=True, exist_ok=True)
    return ws


# ---------------- run_in_sandbox ----------------

def test_container_tidak_running_langsung_ok_false(fake_docker):
    calls, running = fake_docker
    running["containers"] = set()  # wfs-agent-a1 absen
    res = sandbox_exec.run_in_sandbox("a1", "print(1)")
    assert res["ok"] is False
    assert "tidak running" in res["output"]
    # hanya docker ps yg dipanggil — docker exec TIDAK pernah
    exec_calls = [c for c in calls if c[0][1] == "exec"]
    assert exec_calls == []


def test_script_ditulis_ke_workspace_dan_eksekusi_ok(fake_docker):
    calls, running = fake_docker
    running["containers"] = {"wfs-agent-a1"}
    running["exec_result"] = _FakeProc(returncode=0, stdout="hasil\n", stderr="")
    _mkdir_workspace(sandbox_exec.SANDBOX_BASE, "a1")
    res = sandbox_exec.run_in_sandbox("a1", "print('hai')")
    assert res["ok"] is True
    assert res["output"] == "hasil"
    # script tersimpan di workspace agent
    script = pathlib.Path(sandbox_exec.SANDBOX_BASE) / "a1" / "workspace" / "_task_script.py"
    assert script.read_text() == "print('hai')"
    # docker exec dipanggil dgn nama container & path /workspace
    exec_args = [c[0] for c in calls if c[0][1] == "exec"]
    assert exec_args == [["docker", "exec", "wfs-agent-a1", "python3", "/workspace/_task_script.py"]]


def test_returncode_nonzero_ok_false(fake_docker):
    calls, running = fake_docker
    running["containers"] = {"wfs-agent-b2"}
    running["exec_result"] = _FakeProc(returncode=1, stdout="", stderr="Traceback ...")
    _mkdir_workspace(sandbox_exec.SANDBOX_BASE, "b2")
    res = sandbox_exec.run_in_sandbox("b2", "1/0")
    assert res["ok"] is False
    assert "Traceback" in res["output"]


def test_timeout_dikembalikan_ok_false(fake_docker):
    calls, running = fake_docker
    running["containers"] = {"wfs-agent-c3"}
    running["exec_result"] = subprocess.TimeoutExpired("docker exec", 60)
    _mkdir_workspace(sandbox_exec.SANDBOX_BASE, "c3")
    res = sandbox_exec.run_in_sandbox("c3", "while True: pass", timeout=60)
    assert res["ok"] is False
    assert "timeout" in res["output"]


def test_output_dipotong_4000_karakter(fake_docker):
    calls, running = fake_docker
    running["containers"] = {"wfs-agent-d4"}
    running["exec_result"] = _FakeProc(returncode=0, stdout="x" * 9999, stderr="")
    _mkdir_workspace(sandbox_exec.SANDBOX_BASE, "d4")
    res = sandbox_exec.run_in_sandbox("d4", "print('banyak')")
    assert res["ok"] is True
    assert len(res["output"]) == 4000


# ---------------- run_tests_in_sandbox ----------------

def test_run_tests_container_tidak_running(fake_docker):
    calls, running = fake_docker
    running["containers"] = set()
    res = sandbox_exec.run_tests_in_sandbox("a1")
    assert res["ok"] is False
    assert "tidak running" in res["output"]


def test_run_tests_ok_dan_timeout(fake_docker):
    calls, running = fake_docker
    running["containers"] = {"wfs-agent-a1"}
    running["exec_result"] = _FakeProc(returncode=0, stdout="28 passed in 0.5s\n")
    res = sandbox_exec.run_tests_in_sandbox("a1")
    assert res["ok"] is True
    assert "28 passed" in res["output"]

    running["exec_result"] = subprocess.TimeoutExpired("docker exec", 120)
    res2 = sandbox_exec.run_tests_in_sandbox("a1", timeout=120)
    assert res2["ok"] is False
    assert "timeout" in res2["output"]
