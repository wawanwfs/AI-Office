# WFS AI Office — Phase 6 Developer / Operator Runbook

**Environment:** disposable development PC / runner only. Never connect
production accounts, AI provider credentials or external exposed services
without an independently approved deployment and rollback plan.

## Windows 10/11 and Linux verification

On Windows, install Git, Python 3.11, Node.js 22, and Docker Desktop with
WSL2 integration using the official installers. `winget` is optional.
Check `docker info` and `wsl --status` in Windows PowerShell. For Linux
Docker tests use a WSL2 Linux shell, keeping the repo in its Linux filesystem
for mount/permission fidelity; Windows PowerShell can run the frontend tests.

```sh
git clone https://github.com/wawanwfs/AI-Office.git
cd AI-Office
npm ci
npm test
npm run build
python -m pip install -r requirements-pytest.txt
PYTHONPATH=backend:backend_live python -m pytest backend_live backend -q
docker info
PYTHONPATH=backend python scripts/ci_docker_sandbox_smoke.py
PYTHONPATH=backend python scripts/ci_code_qa_smoke.py
PYTHONPATH=backend:backend_live python scripts/ci_e2e_coding_worker.py
```

The last command creates a synthetic, **offline** Python fixture through the
real code task engine, fenced worker, durable queue, Docker QA and artifact
store. No AI provider API access or paid usage is performed. If any test
fails, do not continue to launch real code from user prompts.

## Authenticated human brief intake

Only enable the existing secure HTTP v4 gateway with its strict legacy
firewall. It needs private `WFS_MASTER_QUEUE_DB`, `WFS_COST_DB`,
`WFS_RBAC_DB`, `WFS_AUTH_DB` and two strict paid-route guards as in the
Phase 5 runbook. Provision **separate** worker/QA service with an approved
digest-pinned image, approved project budget, project RBAC and launch
approval before setting `WFS_CODE_QA_INTAKE_READY=YES`.

The frontend `SecureProjectPanel` posts to the scoped route
`POST /api/v4/projects/{project_id}/briefs` with bearer auth and a
cryptographically random `Idempotency-Key`. Only `backend` and
`backend2` coding roles are accepted. The response is `202` with
`execution_started=false`: it means the task is **queued**, not completed,
tested or preview-published. Reuse the same idempotency key after a network
timeout; if the receipt is pending/uncertain, investigate locally rather than
creating another potentially billable task. Never reveal the bearer token in
query strings, localStorage, screenshots or logs.

## Template-only Docker preview operator CLI

The reviewed example requires a Vite build first. In a disposable WSL2/Linux
shell:

```sh
npm ci
npx vite build --config examples/fullstack-preview/frontend/vite.config.mjs
python -m pip install httpx==0.28.1
export WFS_PREVIEW_TEST_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
python scripts/wfs_operator_preview.py start --approved \
  --project demo-alpha --port 19010 --state-root "$HOME/wfs-preview-private"
python scripts/wfs_operator_preview.py status --approved \
  --project demo-alpha --state-root "$HOME/wfs-preview-private"
python scripts/wfs_operator_preview.py logs --approved \
  --project demo-alpha --state-root "$HOME/wfs-preview-private"
python scripts/wfs_operator_preview.py restart --approved \
  --project demo-alpha --state-root "$HOME/wfs-preview-private"
python scripts/wfs_operator_preview.py stop --approved --discard-data \
  --project demo-alpha --state-root "$HOME/wfs-preview-private"
```

Preview binds only to `http://127.0.0.1:19010`. This is **not** a
publicly authenticated project preview service. Do not tunnel it or expose
it to the internet. The database and token are disposable test values and
will be removed with `--discard-data`. Different projects must use
different ports and secrets; protect the operator environment and keep
Docker daemon authorization away from the public HTTP gateway.

GitHub Actions `dynamic-preview-operator` proves two independent
templates on ports 19010/19011, PostgreSQL query, cross-token rejection,
restart and cleanup. `fullstack-preview-proof` additionally checks SSE,
WS tickets, screenshots and download auth on its own disposable stack.

**Security gap:** the reference Compose API joins an edge bridge with
unverified outbound egress; no untrusted AI-authored code may be launched
there until a reviewed network and image admission policy exists.

## Budget and streaming provider adapter

`backend/metered_stream_provider.py` is explicitly worker-only, buffers SSE
content until real final usage is settled against the approved CostLedger
hard cap. Missing usage, redirects or interrupted output preserve a held,
uncertain reservation. Tests use mock HTTPS transport, not live provider
traffic or invoices. It is **not** integrated into every paid legacy path
and must not be treated as billing-complete.

## Recovery and deployment

Follow [Phase 5](PHASE5_RUNTIME_RUNBOOK.md) for SQLite WAL snapshot and
create-only recovery. Stop ALL relevant writers before coherent multi-DB
checkpoint; never overwrite live databases. No Windows/Linux cleanroom
server install, encrypted backup and tested rollback was completed in Phase
6. Preserve production, and do not enable a public preview or paid provider
without explicit authorization and independent threat review.
