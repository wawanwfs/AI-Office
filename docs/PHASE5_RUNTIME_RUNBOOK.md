# WFS AI Office — Phase 5 Local Validation / Backup Runbook

This is for a **disposable Windows/WSL2 or Linux development machine**.
Nothing here authorizes production deployment or real paid AI calls.

## Windows 10/11 using PowerShell + Docker Desktop/WSL2

1. Install Git for Windows, Python 3.11, Node.js 22 and Docker Desktop with
   WSL2 backend from their official installers. No `winget` required.
2. Run `docker info`, `wsl --status`, `python --version`, `node --version`.
   Enable Docker Desktop WSL integration for the target Linux distro.
3. Clone repository and run `npm ci`, `npm test`, `npm run build`,
   `python -m pip install -r requirements-pytest.txt`, and
   `python -m pytest backend_live backend -q`.
4. From WSL2 (Linux shell; project located in its Linux filesystem for best
   Docker mount/permission fidelity), execute the CI-only Docker tests:

```sh
docker info
PYTHONPATH=backend python scripts/ci_docker_sandbox_smoke.py
PYTHONPATH=backend python scripts/ci_code_qa_smoke.py
```

Do not mount the Docker socket into the HTTP gateway. The test runner is
local and disposable, not the production application server.

## Linux host

Use an authorized disposable Docker Engine environment, Python 3.11,
Node.js 22 and the same commands. Inspect `phase5-real-code-qa`,
`phase4-docker-runtime-proof` and `phase5-real-fullstack-preview` from
a green GitHub Actions run. The Docker container must operate under
resource restrictions and be removed even after failed tests/revocation.

## Two fullstack sample stacks

CI builds React/Vite assets from `examples/fullstack-preview/frontend` and
runs two Docker Compose projects on loopback ports 18765 and 18766 with
**distinct ephemeral bearer tokens**, using
`examples/fullstack-preview/compose.yaml`. The `ci_fullstack_preview.py`
accepts `WFS_PREVIEW_BASE`, `WFS_PREVIEW_EVIDENCE_LABEL`, and
`WFS_PREVIEW_OTHER_TOKEN`. This is only a **fixed two-stack demonstration**.
For exact reproducible commands, follow `.github/workflows/ci.yml`.
Never publish these CI demo credentials or expose the ports to external
networks. Use `docker compose down --volumes --remove-orphans` to tear down.

## SQLite snapshots, restore and rollback preparation

Worker, gateway, queue, RBAC, cost and token DBs may be independently
written. **Stop all writers and verify that they have stopped** before
collecting a coherent collection of DB snapshots. Live backup while writers
run is internally consistent *per file*, not globally atomic across DBs.

From PowerShell in a disposable project directory:

```powershell
python scripts/wfs_db_recovery.py --backup --approved `
  --database "queue=C:\WFS-Test\queue.db" `
  --database "cost=C:\WFS-Test\cost.db" `
  --destination "C:\WFS-Test\backup-001"

python scripts/wfs_db_recovery.py --restore "C:\WFS-Test\backup-001" `
  --destination "C:\WFS-Test\restored-copy" --approved
```

The tool:
- requires an explicit `--approved` flag;
- rejects symlinked DB paths and duplicate/invalid names;
- uses SQLite's backup API to copy WAL state safely;
- verifies `PRAGMA quick_check` and SHA-256 hashes;
- creates a **new** destination; it never overwrites a running DB;
- leaves starting/stopping services and final cutover to an authorized
  operator with an independently tested rollback plan.

Use the same command in Linux with Linux paths. Check the restored copy in
a separate test environment before considering any production migration.

## Code-task intake

`WFS_CODE_QA_INTAKE_READY=YES` is an explicit opt-in for the secure
`/api/v4` gateway to accept **backend/backend2** tasks into the queue.
This does not launch an execution itself. A separate worker must have
`WFS_CODE_SANDBOX_ENABLED=YES`, a pinned `WFS_QA_PYTHON_IMAGE`
digest, approved cost budgets and project ACL. Never put a Docker daemon
socket or AI provider secrets into the public gateway. Frontend/DevOps code
tasks remain denied until role-specific objective QA is available.

## Unfinished areas

No production Docker worker, generic stack preview manager, real paid
provider reconciliation, arbitrary legacy API compatibility or validated
Windows/Linux production rollback exists in this phase. Preserve previous
systems and do not claim production-ready.
