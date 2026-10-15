"""Sandbox executor: jalankan potongan kode Python di container sandbox agent via docker exec.
Aman: memory/CPU capped di level container, workspace terisolasi."""
import subprocess
import os

SANDBOX_BASE = os.path.expanduser("~/wfs-office/sandboxes")


def run_in_sandbox(agent_id: str, code: str, timeout: int = 60) -> dict:
    """Jalankan kode Python di container wfs-agent-<agent_id>. Return {ok, output}."""
    name = f"wfs-agent-{agent_id}"
    # cek container hidup
    r = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True)
    if name not in r.stdout.split():
        return {"ok": False, "output": f"sandbox {name} tidak running"}
    # tulis script ke workspace (mounted) lalu exec
    script_host = os.path.join(SANDBOX_BASE, agent_id, "workspace", "_task_script.py")
    with open(script_host, "w") as f:
        f.write(code)
    try:
        r = subprocess.run(
            ["docker", "exec", name, "python3", "/workspace/_task_script.py"],
            capture_output=True, text=True, timeout=timeout,
        )
        return {"ok": r.returncode == 0, "output": (r.stdout + r.stderr).strip()[:4000]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "output": f"timeout setelah {timeout}s"}


def run_tests_in_sandbox(agent_id: str, timeout: int = 120) -> dict:
    """Jalankan pytest di workspace agent (kalau ada test)."""
    name = f"wfs-agent-{agent_id}"
    r = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True)
    if name not in r.stdout.split():
        return {"ok": False, "output": f"sandbox {name} tidak running"}
    try:
        r = subprocess.run(
            ["docker", "exec", name, "sh", "-c",
             "pip install -q pytest > /dev/null 2>&1; pytest /workspace -x -q 2>&1 | tail -20"],
            capture_output=True, text=True, timeout=timeout,
        )
        return {"ok": r.returncode == 0, "output": r.stdout.strip()[:4000]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "output": f"timeout setelah {timeout}s"}
