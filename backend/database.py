"""
Database layer for WFS PROJECT — Autonomous AI Software House.
Provides SQLite persistent state for Projects, Tasks, Subtasks, Agents, Logs, and Approvals.
"""

import os
import sqlite3
import json
import time

DB_DIR = os.path.expanduser("~/wfs-projects")
DB_PATH = os.path.join(DB_DIR, "wfs_software_house.db")

def get_db():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    conn = get_db()
    with conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            project_type TEXT DEFAULT 'website',
            tech_stack TEXT DEFAULT 'HTML5/Tailwind/JS',
            workspace_path TEXT NOT NULL,
            container_id TEXT,
            container_name TEXT,
            preview_port INTEGER,
            preview_url TEXT,
            status TEXT DEFAULT 'draft',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            title TEXT NOT NULL,
            instruction TEXT NOT NULL,
            task_type TEXT DEFAULT 'website',
            status TEXT DEFAULT 'draft',
            priority TEXT DEFAULT 'medium',
            plan_json TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS subtasks (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            title TEXT NOT NULL,
            role TEXT NOT NULL,
            agent_id TEXT,
            status TEXT DEFAULT 'queued',
            dependencies_json TEXT DEFAULT '[]',
            files_json TEXT DEFAULT '[]',
            order_idx INTEGER DEFAULT 0,
            result_summary TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            floor INTEGER NOT NULL,
            color TEXT NOT NULL,
            status TEXT DEFAULT 'idle',
            current_task_id TEXT,
            model TEXT DEFAULT 'gemini-3.8-flash',
            capabilities_json TEXT,
            updated_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS execution_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT,
            task_id TEXT,
            level TEXT DEFAULT 'INFO',
            message TEXT NOT NULL,
            source TEXT DEFAULT 'system',
            timestamp REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS approvals (
            id TEXT PRIMARY KEY,
            task_id TEXT,
            project_id TEXT,
            action_type TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
        """)

        # Seed the 11 Specialized Roles if empty
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM agents")
        if cur.fetchone()[0] == 0:
            default_agents = [
                # Floor 1: Product & Strategy
                ("agent-pm", "Sari", "Product / Project Manager", 1, "#F59E0B", "gemini-3.8-flash", ["planning", "scoping", "milestones"]),
                ("agent-architect", "Wahyu FS", "Solution Architect", 1, "#3B82F6", "gemini-3.8-flash", ["system_design", "api_contracts", "adr"]),
                ("agent-uiux", "Maya", "UI/UX Designer", 1, "#A78BFA", "gemini-3.8-flash", ["user_journey", "wireframes", "styling"]),

                # Floor 2: Engineering & Development
                ("agent-fe", "Andi", "Frontend Developer", 2, "#FBBF24", "gemini-3.8-flash", ["react", "vite", "html5", "css"]),
                ("agent-be", "Budi", "Backend Developer", 2, "#3B82F6", "gemini-3.8-flash", ["fastapi", "python", "rest_api"]),
                ("agent-db", "Rizky", "Database Engineer", 2, "#22D3EE", "gemini-3.8-flash", ["sqlite", "postgres", "schema", "indexing"]),
                ("agent-devops", "Toni", "DevOps & Infrastructure", 2, "#34D399", "gemini-3.8-flash", ["docker", "ports", "containers", "ci"]),
                ("agent-mobile", "Yoga", "Mobile Engineer", 2, "#60A5FA", "gemini-3.8-flash", ["react_native", "responsive", "pwa"]),

                # Floor 3: Quality, Security & Delivery
                ("agent-qa", "Rina", "QA Automation Engineer", 3, "#FB7185", "gemini-3.8-flash", ["unit_tests", "e2e_tests", "regression"]),
                ("agent-review", "Dewi", "Code Reviewer", 3, "#F472B6", "gemini-3.8-flash", ["code_review", "refactor", "clean_code"]),
                ("agent-sec", "SecBot", "Security Engineer", 3, "#10E5A0", "gemini-3.8-flash", ["vulnerability_scan", "least_privilege", "sanitization"]),
                ("agent-doc", "Lina", "Documentation Engineer", 3, "#FB923C", "gemini-3.8-flash", ["readme", "api_docs", "changelog"])
            ]
            now = time.time()
            for aid, name, role, floor, color, model, caps in default_agents:
                cur.execute(
                    "INSERT INTO agents (id, name, role, floor, color, status, model, capabilities_json, updated_at) VALUES (?, ?, ?, ?, ?, 'idle', ?, ?, ?)",
                    (aid, name, role, floor, color, model, json.dumps(caps), now)
                )

    conn.close()

# Helper Functions
def log_event(message, project_id=None, task_id=None, level="INFO", source="system"):
    try:
        conn = get_db()
        with conn:
            conn.execute(
                "INSERT INTO execution_logs (project_id, task_id, level, message, source, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (project_id, task_id, level, message, source, time.time())
            )
        conn.close()
    except Exception as e:
        print(f"[LogEvent Error] {e}")

def get_recent_logs(limit=50, project_id=None):
    conn = get_db()
    cur = conn.cursor()
    if project_id:
        cur.execute("SELECT * FROM execution_logs WHERE project_id = ? ORDER BY id DESC LIMIT ?", (project_id, limit))
    else:
        cur.execute("SELECT * FROM execution_logs ORDER BY id DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def list_projects():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM projects ORDER BY updated_at DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def get_project(project_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM projects WHERE id = ? OR slug = ?", (project_id, project_id))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

def save_project(proj):
    conn = get_db()
    now = time.time()
    with conn:
        conn.execute("""
            INSERT INTO projects (id, name, slug, description, project_type, tech_stack, workspace_path, container_id, container_name, preview_port, preview_url, status, created_at, updated_at)
            VALUES (:id, :name, :slug, :description, :project_type, :tech_stack, :workspace_path, :container_id, :container_name, :preview_port, :preview_url, :status, :created_at, :updated_at)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                description=excluded.description,
                project_type=excluded.project_type,
                tech_stack=excluded.tech_stack,
                container_id=excluded.container_id,
                container_name=excluded.container_name,
                preview_port=excluded.preview_port,
                preview_url=excluded.preview_url,
                status=excluded.status,
                updated_at=:updated_at
        """, {**proj, "created_at": proj.get("created_at", now), "updated_at": now})
    conn.close()

def list_agents():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM agents ORDER BY floor ASC, id ASC")
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        if d.get("capabilities_json"):
            try:
                d["capabilities"] = json.loads(d["capabilities_json"])
            except Exception:
                d["capabilities"] = []
        rows.append(d)
    conn.close()
    return rows

def update_agent_status(agent_id, status, current_task_id=None):
    conn = get_db()
    with conn:
        conn.execute(
            "UPDATE agents SET status = ?, current_task_id = ?, updated_at = ? WHERE id = ? OR role LIKE ?",
            (status, current_task_id, time.time(), agent_id, f"%{agent_id}%")
        )
    conn.close()


def get_overview():
    """Ringkasan perangkat lunak (untuk dashboard owner) — dihitung dari state
    persisten SQLite yang nyata, bukan angka hardcoded."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM projects")
    projects = cur.fetchone()[0]
    cur.execute("SELECT status, COUNT(*) FROM tasks GROUP BY status")
    task_counts = {r[0]: r[1] for r in cur.fetchall()}
    cur.execute("SELECT status, COUNT(*) FROM agents GROUP BY status")
    agent_status = {r[0]: r[1] for r in cur.fetchall()}
    cur.execute("SELECT COUNT(*) FROM subtasks WHERE status='running'")
    running_subtasks = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM execution_logs")
    total_logs = cur.fetchone()[0]
    log_rows = get_recent_logs(limit=8)
    conn.close()
    return {
        "projects": projects,
        "tasks": sum(task_counts.values()),
        "task_by_status": task_counts,
        "agents": sum(agent_status.values()),
        "agent_by_status": agent_status,
        "running_subtasks": running_subtasks,
        "total_logs": total_logs,
        "recent_logs": log_rows,
    }

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)
    print("Default agents seeded:", len(list_agents()))
