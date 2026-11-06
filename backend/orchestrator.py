"""
Autonomous Task Orchestrator & Multi-Agent Engine for WFS PROJECT.
Decomposes natural language instructions into subtasks, coordinates the 11 agent roles,
manages dependency graphs, generates concrete code in Docker sandboxes, and verifies execution.
"""

import time
import json
import uuid
import re
import os
try:
    from .database import (
        get_db, save_project, get_project, log_event, update_agent_status
    )
    from .docker_sandbox import DockerSandboxManager
except (ImportError, ValueError):
    from database import (
        get_db, save_project, get_project, log_event, update_agent_status
    )
    from docker_sandbox import DockerSandboxManager

class TaskOrchestrator:
    @classmethod
    def plan_task(cls, instruction, project_name=None, task_type="website", priority="high"):
        conn = get_db()
        task_id = f"task-{uuid.uuid4().hex[:8]}"

        # Auto-determine project name and slug if not provided
        if not project_name:
            match = re.search(r'(?:website|aplikasi|dashboard|proyek|sistem)\s+([a-zA-Z0-9\s\-]+)', instruction, re.IGNORECASE)
            if match:
                project_name = match.group(0).strip().title()
            else:
                project_name = f"WFS Project {task_id[-4:].upper()}"

        slug = re.sub(r'[^a-z0-9]+', '-', project_name.lower()).strip('-')
        proj_id = f"proj-{slug}"

        # Ensure project exists
        existing_proj = get_project(proj_id)
        if not existing_proj:
            ws_path = DockerSandboxManager.scaffold_project(proj_id, project_name, project_type=task_type)
            proj_data = {
                "id": proj_id,
                "name": project_name,
                "slug": slug,
                "description": instruction,
                "project_type": task_type,
                "tech_stack": "HTML5 / TailwindCSS / Single-File App",
                "workspace_path": ws_path,
                "container_id": None,
                "container_name": None,
                "preview_port": None,
                "preview_url": f"/preview/{proj_id}/",
                "status": "ready"
            }
            save_project(proj_data)
        else:
            proj_data = existing_proj

        # Subtask breakdown based on software house roles
        subtasks_blueprint = [
            {
                "title": "Scope & Technical Requirements Analysis",
                "role": "Product / Project Manager",
                "agent_id": "agent-pm",
                "deps": []
            },
            {
                "title": "Architecture & Component Design",
                "role": "Solution Architect",
                "agent_id": "agent-architect",
                "deps": ["Scope & Technical Requirements Analysis"]
            },
            {
                "title": "UI/UX Layout & Obsidian Dark Theme Tokens",
                "role": "UI/UX Designer",
                "agent_id": "agent-uiux",
                "deps": ["Architecture & Component Design"]
            },
            {
                "title": "Frontend Implementation & Responsive Interactivity",
                "role": "Frontend Developer",
                "agent_id": "agent-fe",
                "deps": ["UI/UX Layout & Obsidian Dark Theme Tokens"]
            },
            {
                "title": "Docker Sandbox Containerization & Port Allocation",
                "role": "DevOps & Infrastructure",
                "agent_id": "agent-devops",
                "deps": ["Frontend Implementation & Responsive Interactivity"]
            },
            {
                "title": "Automated Quality & Healthcheck Verification",
                "role": "QA Automation Engineer",
                "agent_id": "agent-qa",
                "deps": ["Docker Sandbox Containerization & Port Allocation"]
            },
            {
                "title": "Code Review & Security Audit",
                "role": "Code Reviewer",
                "agent_id": "agent-review",
                "deps": ["Automated Quality & Healthcheck Verification"]
            },
            {
                "title": "Project README & Operational Documentation",
                "role": "Documentation Engineer",
                "agent_id": "agent-doc",
                "deps": ["Code Review & Security Audit"]
            }
        ]

        now = time.time()
        plan_meta = {
            "objective": instruction,
            "project_id": proj_id,
            "project_name": project_name,
            "acceptance_criteria": [
                "Production-grade code written into workspace",
                "Zero path-traversal or privileged security violations",
                "Container healthy and responding on allocated preview port",
                "Automated test suite passed without regressions"
            ],
            "subtasks_count": len(subtasks_blueprint)
        }

        with conn:
            conn.execute(
                "INSERT INTO tasks (id, project_id, title, instruction, task_type, status, priority, plan_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)",
                (task_id, proj_id, f"Develop: {project_name}", instruction, task_type, priority, json.dumps(plan_meta), now, now)
            )

            for idx, st in enumerate(subtasks_blueprint):
                st_id = f"st-{uuid.uuid4().hex[:8]}"
                conn.execute(
                    "INSERT INTO subtasks (id, task_id, title, role, agent_id, status, dependencies_json, order_idx, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)",
                    (st_id, task_id, st["title"], st["role"], st["agent_id"], json.dumps(st["deps"]), idx, now, now)
                )

        conn.close()
        log_event(f"Task {task_id} planned for '{project_name}' with {len(subtasks_blueprint)} subtasks", project_id=proj_id, task_id=task_id, level="INFO")
        return {"task_id": task_id, "project_id": proj_id, "project": proj_data, "subtasks": subtasks_blueprint}

    @classmethod
    def execute_task(cls, task_id):
        """Retired demo pipeline; not a verified or authorized executor."""
        raise PermissionError("Legacy demo orchestrator execution is disabled")
