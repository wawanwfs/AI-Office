# WFS AI Office — Phase 4 REA & Acceptance Evidence

Audit on 2026-11-08. Starting commit `e3704bbca060e2dcba9659be257d61e55325998b`.
Read [Phase 3](REA_PHASE3.md) for inherited components. This matrix
reflects **code and GitHub-hosted test infrastructure**, not production
deployment. It does not authorize deploying any service.

## Results separated from claims

| Area | Implemented | Evidence | Remaining risk |
| --- | --- | --- | --- |
| Worker concurrency | Unique per-attempt workspace `project/job/attempt`, per-task ContextVar rather than shared `REPO`, parallel slot workers | Python isolated concurrency and cross-project tests | Legacy executor has paths outside the new context that still need threat review, and paid provider not run live |
| Queue reliability | Lease heartbeat, cancel and fencing; risky worker failure marked terminal without blind paid retry | SQLite transaction/cancellation tests | Process-kill and external provider idempotency need end-to-end validation |
| RBAC | Last-owner demotion blocked, scope rechecked before paid calls | Database unit and API TestClient cross-tenant tests | Authentication not yet applied to all legacy gateway routes |
| HTTP control API | Opt-in `/api/v4` bearer token verified from SHA-256 digest and TTL; read queue/events/budget/usage; scoped enqueue/cancel | FastAPI TestClient with fake and revoked tokens, project crossing attempts | Separate v4 route does NOT make old /api/* routes multi-tenant safe |
| Docker worker sandbox | Explicitly enabled Docker CLI runner in separate module, non-root, readonly, no network, zero capabilities, no privilege elevation, CPU/RAM/PID limits, forced cleanup | **Real GitHub Actions daemon** runs isolated projects and validates file/network/uid/cleanup. HostConfig inspection, image digest pin and concurrent project containers are verified on the disposable CI Docker daemon. | Not yet wired to code-generation task engine, no image registry admission, no production worker host runtime rehearsal |
| Cost accounting | Approved caps and provider response usage tracking retained from Phase 3 | SQLite and simulated HTTPS provider tests | Chat/streaming/all providers and real invoice reconciliation missing |
| Website/3D UI | Existing React/Three and Chromium desktop/mobile screenshots retained | npm tests and headless browser CI; gateway offline | No full agent backend-driven UI/real hardware GPU performance proof |
| Fullstack preview | Existing static sandbox and partial preview scaffolds | Unit tests only | Per-project React/FastAPI/Postgres deployment, authenticated WebSocket/SSE/log/artifact proxy are **not implemented** |
| Deployment | Explicit cutover blocker, no gateway Docker socket and no provider secrets | Static compose tests | No production deployment or backup/restore proof |
| SAST/SCA | Focused Bandit Python static scan added to CI | Focused `security-static` job passed and uploaded a JSON report | No repository-wide SCA/SAST, secret scanning, dynamic penetration test |

## Measurable Phase 4 acceptance gates

These checks have narrower definitions than full production acceptance.
A checked item means a specific implementation plus corresponding CI tests.

1. [x] Worker project and job attempts use ContextVar-based directory isolation (unit tests).
2. [x] Multiple workers dispatch concurrently across independent projects with queue limits (unit tests).
3. [x] Potentially billable failures do not retry automatically; reconciliation is required (unit tests).
4. [x] Last-owner demotion is denied transactionally (RBAC unit tests).
5. [x] Bearer tokens are locally minted, hashed, expire and can be revoked (HTTP TestClient).
6. [x] `/api/v4` enforces cross-tenant RBAC on jobs, events, budget, usage and cancellation (HTTP TestClient).
7. [x] Real Docker CI executes a limited no-network, read-only, non-root test project with cleanup.
8. [x] Docker CI inspects actual CPU/RAM/PID/volume limits and tests simultaneous project containers, with recorded runtime assertions.
9. [x] Legacy frontend/backend and browser E2E quality gates remain present.
10. [x] Focused Bandit SAST passes medium/high severity checks and uploads the JSON report.
11. [ ] All paid chat, streaming and multi-provider requests use metered ledger and invoice reconciliation.
12. [ ] Generated coding tasks use project-scope Docker QA, cancellation and artifact verification end to end.
13. [ ] Full-stack project preview supports React, FastAPI, PostgreSQL, WebSocket, SSE, auth and cleanup.
14. [ ] All legacy public HTTP routes enforce authenticated per-user and per-project ACL.
15. [ ] Deployment/rollback with snapshots and restore has succeeded on disposable authorized infrastructure.
16. [ ] Clean-room Windows 10/11 Docker Desktop/WSL2 and Linux install tests pass.
17. [ ] Real GPU WebGL, fallback, animation and mobile accessibility/performance tests on target devices.
18. [ ] Whole-repository SCA, SAST, secret scanning and egress/network threat tests pass.

**10 / 18 = 55.6%** of these deliberately bounded Phase 4 checks, verified
by successful workflow [42467839168](https://github.com/wawanwfs/AI-Office/actions/runs/42467839168).
This is NOT the percentage of total WFS development or production readiness.

## Deployment / risk control

- The GitHub Actions Docker daemon is disposable; test evidence does not
  prove a production Docker worker or full-stack preview works.
- Gateway control API is disabled by default. It requires
  `WFS_SECURE_CONTROL_API_ENABLED=YES`,
  `WFS_MASTER_QUEUE_REQUIRED=1`, `WFS_METERING_REQUIRED=1`,
  and private queue/cost/RBAC/auth SQLite paths.
- Never put bearer tokens in query strings, browser localStorage, Git
  commits, screenshots, or application logs. CLI token minting is local.
- Worker is off by default. Old unmetered paid chat and Docker routes are
  disabled in strict gateway mode. Do not expose the legacy endpoints to
  untrusted clients.
- **No production-ready claim** while code-task sandbox, old-route auth,
  metered chat, preview runtime, all security scans and rollback P0 remain.
- See [runtime runbook](PHASE4_RUNTIME_RUNBOOK.md) and
  [Phase 5 handoff](NEXT_PHASE5_PROMPT.md).
