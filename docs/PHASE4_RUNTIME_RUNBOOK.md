# WFS AI Office — Phase 4 isolated runtime verification

This document is a **development/rehearsal runbook**, not authorization
to start any deployment on production servers.

## Windows 10/11 + Docker Desktop/WSL2

1. Enable WSL2/virtualization in Windows Features and install/update
   [Docker Desktop](https://www.docker.com/products/docker-desktop/) from
   its official installer, using the WSL2 backend.
2. Install Python 3.11 and Node.js 22 from official installers (no winget
   required). Install Git for Windows.
3. In PowerShell, run `docker info`, `wsl --status`,
   `python --version`, and `node --version`. If Docker engine is not
   available, enable WSL integration in Docker Desktop settings.
4. Clone `https://github.com/wawanwfs/AI-Office.git` in a disposable
   development directory. Run `npm ci`, `npm test`,
   `npm run build`, `python -m pip install -r requirements-pytest.txt`,
   and `python -m pytest backend_live backend -q`.
5. Launch only the isolated Docker smoke through a **WSL2 Linux shell**
   using `PYTHONPATH=backend python scripts/ci_docker_sandbox_smoke.py`
   after the pinned image is available. The script mounts temporary folders
   and cleans its own containers; it does not deploy the AI Office gateway.
6. Do not mount `/var/run/docker.sock` into any public-facing gateway
   container. The actual Docker launcher resides in
   `backend/sandbox_runtime.py` and should execute only in a restricted
   local worker context, never from arbitrary HTTP requests.

## Linux (Ubuntu host, isolated non-production runner)

1. Use a disposable test VM with working Docker Engine, Python 3.11,
   Node.js 22 and Git. Run `docker info` as the authorized test operator.
2. Clone the repository and run the same CI tests above; for the runtime
   proof use `PYTHONPATH=backend python scripts/ci_docker_sandbox_smoke.py`.
3. Read the actual result in GitHub Actions artifacts named
   `phase4-docker-runtime-proof`. Checks include non-root UID,
   read-only workspace/root, egress disabled, project isolation and cleanup.
4. The Docker smoke uses Docker daemon privileges **on the CI runner only**.
   A production worker needs a carefully isolated Docker authorization
   boundary and host hardening review; this is not yet implemented.

## Scoped control API (operator opt-in only)

- The source of the router is `backend/secure_control_api.py`.
- To mint a one-hour bearer token on an isolated local machine:

```powershell
$env:WFS_LOCAL_OPERATOR_APPROVED="YES"
$env:WFS_AUTH_DB="./sandbox-auth.db"
python scripts/wfs_auth_token.py wawanwfs
```

The token prints once and is NOT stored in plaintext in SQLite. In a
real deployment use a secret manager, short token TTL and TLS.

- `backend_live/wfs_server.py` attaches `/api/v4` **only if**
  `WFS_SECURE_CONTROL_API_ENABLED=YES`, both strict-mode guards are active
  and all four private DB paths are set. Do not enable this on a public
  gateway until the module is provisioned and ALL legacy routes are
  authenticated. `/api/v4` auth alone does not secure existing routes.
- The API permits scoped read, enqueue and cooperative cancellation, not
  arbitrary shell or Docker commands. An enqueue response says
  `execution_started:false`; execution requires an approved worker.
- The token CLI does not create project ACL or spending approval.
  Explicitly bootstrap owner RBAC and the CostLedger separately through
  privileged local operator code after review.

## Recovery and limitations

- Failed or expired charged work is not replayed silently: review provider
  invoice/usage and retained ledger before a human authorizes a new job.
- The existing production cutover script blocks deployment until an
  explicit *new* migration rehearsal. No server was modified from this run.
- This phase has **no authenticated full-stack preview implementation**
  and has not proven rollback, database restore or external provider bill.
