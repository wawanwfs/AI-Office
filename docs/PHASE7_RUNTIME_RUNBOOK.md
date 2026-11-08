# WFS AI Office — Phase 7 Windows/Linux Reproducible Runbook

These instructions apply to DISPOSABLE developer hosts, not production.

## Windows 10/11 native PowerShell

Install Git, Python 3.11, Node.js 22, Docker Desktop and WSL2 from official
installers; winget is not necessary. Use an authorized disposable machine.

~~~powershell
git clone https://github.com/wawanwfs/AI-Office.git
cd AI-Office
python -m pip install -r requirements-pytest.txt
$env:PYTHONPATH = "backend"
python -m pytest backend/test_recovery_snapshot.py backend/test_preview_proxy.py backend/test_billing_reconcile.py backend/test_secure_control_api.py -q
npm ci
npm test
npm run build
wsl --status
docker info
~~~

The native Windows CI runner verifies Python SQLite backup and auth only.
It does NOT run Docker Desktop/WSL2 clean-room installation.

## Linux/WSL2 Docker runtime (disposable only)

Keep the checkout in the WSL Linux filesystem for mount fidelity:

~~~sh
npm ci
npx vite build --config examples/fullstack-preview/frontend/vite.config.mjs
python -m pip install -r requirements-pytest.txt
PYTHONPATH=backend:backend_live python -m pytest backend_live backend -q
PYTHONPATH=backend:backend_live python scripts/ci_e2e_coding_worker.py
python scripts/ci_dynamic_preview_operator.py
~~~

The first CI script runs REAL worker, REAL source writes and Docker QA but
uses OFFLINE synthetic model output. The second starts two reviewed,
disposable React/FastAPI/PostgreSQL templates, checks isolated tokens,
PostgreSQL, restart, loopback authenticated preview GET and blocked external
API sockets. These scripts cannot demonstrate a real paid AI call.

## Operator-only template preview

~~~sh
export WFS_PREVIEW_TEST_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
python scripts/wfs_operator_preview.py start --approved --project demo-alpha --port 19010 --state-root "$HOME/wfs-preview-private"
python scripts/wfs_operator_preview.py status --approved --project demo-alpha --state-root "$HOME/wfs-preview-private"
python scripts/wfs_operator_preview.py stop --approved --discard-data --project demo-alpha --state-root "$HOME/wfs-preview-private"
~~~

Stop removes disposable PostgreSQL volumes. Both app/db networks are
internal; only a reviewed nonroot ingress is connected to a public bridge,
which publishes to HOST LOOPBACK ONLY. This is not a public TLS proxy.
Do not run arbitrary AI-authored Dockerfiles or containers on it.

The Phase 7 preview read-only proxy is disabled by default until an operator
injects a trusted read-only registry and per-project token lookup. It
forwards only approved GETs with RBAC; interactive WS/SSE proxy is not ready.

## Local provider invoice discrepancy review

A local operator must have independently sourced invoice evidence; imported
numbers are NOT independently verified and cannot release uncertain cost.

~~~powershell
python scripts/wfs_invoice_evidence.py --db "C:\WFS-Test\cost.db" --project alpha --provider provider.example --call-id call-id --line-id line-1 --billed-microusd 50 --invoice-file "C:\WFS-Test\invoice.json" --approved-by operator --ack-manual
python scripts/wfs_invoice_evidence.py --db "C:\WFS-Test\cost.db" --project alpha --report
~~~

Replace illustrative values with operator-authorized records. Never paste
provider keys into prompts, logs or CI artifacts.

## Recovery

Stop ALL writers before a coherent multi-DB snapshot. Existing per-file
SQLite WAL backup and create-only restore never overwrite live data.
The native Windows runner verifies file handles, URI paths and backup
integrity; encrypted multi-DB recovery and production rollback are NOT
yet demonstrated. Preserve the live server.
