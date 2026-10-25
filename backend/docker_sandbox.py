"""
Docker Sandbox Manager for WFS PROJECT — Autonomous AI Software House.
Provides isolated container runtimes, dynamic port allocation, workspace scaffolding, and health checks.
"""

import os
import socket
import subprocess
import time
import urllib.request
import json
try:
    from .database import get_db, log_event
except (ImportError, ValueError):
    from database import get_db, log_event

PROJECTS_ROOT = os.path.expanduser("~/wfs-projects")
PORT_RANGE_START = 3100
PORT_RANGE_END = 3900

class DockerSandboxManager:
    @staticmethod
    def is_port_free(port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return True
            except OSError:
                return False

    @classmethod
    def allocate_port(cls):
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT preview_port FROM projects WHERE preview_port IS NOT NULL")
        used_db_ports = {row[0] for row in cur.fetchall()}
        conn.close()

        for p in range(PORT_RANGE_START, PORT_RANGE_END):
            if p not in used_db_ports and cls.is_port_free(p):
                return p
        raise RuntimeError("No available preview ports in designated range 3100-3900")

    @staticmethod
    def get_workspace_path(project_id):
        os.makedirs(PROJECTS_ROOT, exist_ok=True)
        path = os.path.realpath(os.path.join(PROJECTS_ROOT, project_id))
        if not path.startswith(os.path.realpath(PROJECTS_ROOT) + os.sep):
            raise PermissionError("Path traversal attempt detected")
        return path

    @classmethod
    def scaffold_project(cls, project_id, name, project_type="website", tech_stack="HTML5/Tailwind/JS"):
        ws = cls.get_workspace_path(project_id)
        os.makedirs(ws, exist_ok=True)

        index_file = os.path.join(ws, "index.html")
        if not os.path.exists(index_file):
            content = f"""<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{name} — WFS PROJECT Software House</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {{ background-color: #0B0F17; color: #F8FAFC; font-family: system-ui, -apple-system, sans-serif; }}
        .glass {{ background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }}
    </style>
</head>
<body class="min-h-screen flex flex-col justify-between">
    <header class="border-b border-slate-800 glass px-6 py-4 flex items-center justify-between">
        <div class="flex items-center space-x-3">
            <span class="inline-block w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <span class="text-xl font-bold tracking-wider text-white">WFS PROJECT</span>
            <span class="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">LIVE PREVIEW</span>
        </div>
        <div class="text-xs text-slate-400 font-mono">{project_type.upper()} · {tech_stack}</div>
    </header>

    <main class="max-w-4xl mx-auto px-6 py-16 text-center">
        <div class="inline-block px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-6">
            Autonomous AI Software House Artifact
        </div>
        <h1 class="text-5xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            {name}
        </h1>
        <p class="text-lg text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Aplikasi ini dibangun secara otomatis dan berjalan di dalam Docker Sandbox terisolasi WFS PROJECT.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div class="glass p-6 rounded-2xl">
                <div class="text-emerald-400 font-mono text-sm mb-2">01. ARCHITECTURE</div>
                <h3 class="text-white font-semibold text-lg mb-2">Modern Stack</h3>
                <p class="text-slate-400 text-sm">Dirancang dengan clean architecture dan decoupled service boundaries.</p>
            </div>
            <div class="glass p-6 rounded-2xl">
                <div class="text-blue-400 font-mono text-sm mb-2">02. SANDBOX</div>
                <h3 class="text-white font-semibold text-lg mb-2">Docker Isolated</h3>
                <p class="text-slate-400 text-sm">Berjalan dengan isolasi penuh, resource quota 512MB RAM, dan dynamic port leasing.</p>
            </div>
            <div class="glass p-6 rounded-2xl">
                <div class="text-purple-400 font-mono text-sm mb-2">03. QUALITY</div>
                <h3 class="text-white font-semibold text-lg mb-2">Auto Verified</h3>
                <p class="text-slate-400 text-sm">Diverifikasi secara otomatis oleh agent QA, Security, dan Code Reviewer.</p>
            </div>
        </div>
    </main>

    <footer class="border-t border-slate-800 glass px-6 py-4 text-center text-xs text-slate-500 font-mono">
        Built autonomously by WFS PROJECT Multi-Agent System · Status: Active Healthy
    </footer>
</body>
</html>
"""
            with open(index_file, "w", encoding="utf-8") as f:
                f.write(content)

        # Scaffolding Dockerfile
        dockerfile = os.path.join(ws, "Dockerfile")
        if not os.path.exists(dockerfile):
            df_content = """FROM python:3.12-slim
WORKDIR /app
COPY . /app
EXPOSE 8080
CMD ["python3", "-m", "http.server", "8080"]
"""
            with open(dockerfile, "w", encoding="utf-8") as f:
                f.write(df_content)

        # Scaffolding automated test
        testfile = os.path.join(ws, "test_app.py")
        if not os.path.exists(testfile):
            tf_content = """import os

def test_index_exists():
    assert os.path.exists("index.html")

def test_index_content():
    content = open("index.html", encoding="utf-8").read()
    assert "<html" in content
    assert "WFS PROJECT" in content
"""
            with open(testfile, "w", encoding="utf-8") as f:
                f.write(tf_content)

        return ws

    @classmethod
    def start_container(cls, project_id, port=None):
        ws = cls.get_workspace_path(project_id)
        cname = f"wfs-sandbox-{project_id}"

        # Stop / remove existing container if running
        subprocess.run(["docker", "rm", "-f", cname], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        if not port:
            port = cls.allocate_port()

        # Run container unprivileged with tight resource bounds
        cmd = [
            "docker", "run", "-d",
            "--name", cname,
            "-p", f"127.0.0.1:{port}:8080",
            "-v", f"{ws}:/app",
            "--memory=512m",
            "--cpus=1.0",
            "--pids-limit=100",
            "-w", "/app",
            "python:3.12-slim",
            "python3", "-m", "http.server", "8080"
        ]

        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            log_event(f"Failed to start container {cname}: {res.stderr}", project_id=project_id, level="ERROR")
            raise RuntimeError(f"Docker run failed: {res.stderr}")

        cid = res.stdout.strip()

        # Wait and health-check
        healthy = False
        for _ in range(6):
            time.sleep(0.5)
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2) as resp:
                    if resp.status == 200:
                        healthy = True
                        break
            except Exception:
                pass

        status = "running" if healthy else "starting"
        log_event(f"Container {cname} started on port {port} (healthy: {healthy})", project_id=project_id, level="SUCCESS")
        return {
            "container_id": cid,
            "container_name": cname,
            "port": port,
            "preview_url": f"/preview/{project_id}/",
            "direct_url": f"http://127.0.0.1:{port}/",
            "status": status,
            "healthy": healthy
        }

    @classmethod
    def stop_container(cls, project_id):
        cname = f"wfs-sandbox-{project_id}"
        subprocess.run(["docker", "stop", cname], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log_event(f"Container {cname} stopped", project_id=project_id, level="INFO")
        return {"status": "stopped"}

    @classmethod
    def restart_container(cls, project_id):
        cname = f"wfs-sandbox-{project_id}"
        subprocess.run(["docker", "restart", cname], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log_event(f"Container {cname} restarted", project_id=project_id, level="INFO")
        return {"status": "running"}

    @classmethod
    def get_logs(cls, project_id, tail=100):
        cname = f"wfs-sandbox-{project_id}"
        res = subprocess.run(["docker", "logs", "--tail", str(tail), cname], capture_output=True, text=True)
        return res.stdout + res.stderr

    @classmethod
    def run_command(cls, project_id, command):
        ws = cls.get_workspace_path(project_id)
        # Execute inside workspace
        res = subprocess.run(command, shell=True, cwd=ws, capture_output=True, text=True, timeout=30)
        return {
            "stdout": res.stdout,
            "stderr": res.stderr,
            "exit_code": res.returncode
        }
