"""Execute agent Python and tests in a constrained, existing Docker sandbox.

The caller still controls launch authorization and the Docker daemon. This module
validates agent ids and workspace paths, uses unique per-run script files, and
preserves pytest exit codes instead of masking them through shell pipelines.
"""
import os
import re
import subprocess
import tempfile
from pathlib import Path

SANDBOX_BASE = os.path.expanduser("~/wfs-office/sandboxes")
_AGENT_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z")


def _agent_name(agent_id):
    if not isinstance(agent_id, str) or not _AGENT_ID.fullmatch(agent_id):
        return None
    return f"wfs-agent-{agent_id}"


def _timeout(value, maximum=300):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1 or value > maximum:
        return None
    return value


def _container_running(name):
    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return False, f"docker error: {result.stderr.strip()[:300]}"
        if name not in result.stdout.split():
            return False, f"sandbox {name} tidak running"
        return True, ""
    except Exception as exc:
        return False, f"docker error: {exc}"


def _safe_workspace(agent_id):
    """Reject traversal and symlinked workspace escapes before host writes."""
    root = Path(SANDBOX_BASE).resolve()
    workspace = root / agent_id / "workspace"
    resolved = workspace.resolve()
    if not resolved.is_relative_to(root) or resolved == root:
        raise PermissionError("workspace sandbox tidak aman")
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def run_in_sandbox(agent_id: str, code: str, timeout: int = 60) -> dict:
    """Run Python code inside a named Docker agent container."""
    name = _agent_name(agent_id)
    limit = _timeout(timeout)
    if name is None:
        return {"ok": False, "output": "agent_id tidak valid"}
    if limit is None:
        return {"ok": False, "output": "timeout tidak valid (1–300 detik)"}
    if not isinstance(code, str) or len(code.encode("utf-8")) > 524288:
        return {"ok": False, "output": "kode tidak valid atau melebihi 512 KiB"}

    running, error = _container_running(name)
    if not running:
        return {"ok": False, "output": error}

    # Each invocation gets its own file, so simultaneous runs for one agent
    # cannot execute a different task's code by overwriting _task_script.py.
    script_host = None
    try:
        workspace = _safe_workspace(agent_id)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=workspace,
            prefix=".wfs-task-", suffix=".py", delete=False,
        ) as tmp:
            script_host = Path(tmp.name)
            tmp.write(code)
    except Exception as exc:
        if script_host is not None:
            script_host.unlink(missing_ok=True)
        return {"ok": False, "output": f"gagal menulis script: {exc}"}

    try:
        result = subprocess.run(
            ["docker", "exec", name, "python3", f"/workspace/{script_host.name}"],
            capture_output=True, text=True, timeout=limit,
        )
        return {"ok": result.returncode == 0,
                "output": (result.stdout + result.stderr).strip()[:4000]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "output": f"timeout setelah {limit}s"}
    except Exception as exc:
        return {"ok": False, "output": f"exec error: {exc}"}
    finally:
        # Also runs on timeout or Docker errors; no residual scripts or shared
        # fixed target remain on the host between task executions.
        script_host.unlink(missing_ok=True)


def run_tests_in_sandbox(agent_id: str, timeout: int = 120) -> dict:
    """Run pytest directly, retaining pytest's true process exit status.

    pytest must be preinstalled in the sandbox image. Installing packages during
    each test execution can mutate the sandbox and is intentionally avoided.
    """
    name = _agent_name(agent_id)
    limit = _timeout(timeout)
    if name is None:
        return {"ok": False, "output": "agent_id tidak valid"}
    if limit is None:
        return {"ok": False, "output": "timeout tidak valid (1–300 detik)"}

    running, error = _container_running(name)
    if not running:
        return {"ok": False, "output": error}
    try:
        result = subprocess.run(
            ["docker", "exec", name, "python3", "-m", "pytest", "/workspace", "-x", "-q"],
            capture_output=True, text=True, timeout=limit,
        )
        return {"ok": result.returncode == 0,
                "output": (result.stdout + result.stderr).strip()[-4000:]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "output": f"timeout setelah {limit}s"}
    except Exception as exc:
        return {"ok": False, "output": f"test error: {exc}"}
