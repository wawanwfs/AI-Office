# WFS AI Office — Phase 5 REA & Evidence Matrix

> Evidence snapshot: 2026-11-08. The starting Phase 5 HEAD was
> `10e031eeaf6889bc79aef73c0d9031196debee73` and inherited
> [Phase 4](REA_PHASE4.md). This is **not** a production deployment.

## Ground-truth evidence

- Python unit / integration tests: GitHub Actions `pytest`, run-scoped
  temporary SQLite and FastAPI TestClient. No live external paid provider.
- Frontend Vitest / Vite build and real Chromium: GitHub Actions `build`
  and `browser`; the primary UI screenshots run with the gateway **offline**.
- `code-qa-runtime`: a real disposable GitHub Actions Docker daemon tests
  two independent Python project workspaces, failing tests, revocation,
  bounded generated output, manifest digests and container cleanup.
  It does NOT exercise a real paid LLM generating the code.
- `docker-runtime`: real CPU/RAM/PID cap inspection, non-root, readonly
  filesystem, no network egress and concurrent project containers.
- `fullstack-preview-proof`: two disposable Compose projects with distinct
  loopback ports and tokens, actual React/Vite, FastAPI, PostgreSQL queries,
  SSE, one-use WebSocket tickets, downloads, screenshots and cross-token
  denial. **This is a fixed demo, not the dynamic project preview manager.**
- `security-static`, `dependency-security`, `secret-patterns`: scoped
  Bandit, npm and pip dependency audit, high-confidence tracked-file
  pattern scanning. Not a whole-history credential scanner or pentest.
- `backend/recovery_snapshot.py`: WAL-safe **per-DB** snapshot via SQLite
  backup, SHA-256 manifest validation, create-only restore, malicious path
  checks and tests on spaces/special-character paths. Multi-DB checkpoint
  needs a maintenance window. No actual production rollback took place.

## REA findings

| Capability | Working / verified boundary | Remaining production blocker |
| --- | --- | --- |
| Master worker | SQLite job leases/heartbeats/recovery, ContextVar per-attempt workspace, bounded parallel dispatch | Real provider side-effect idempotency, crash across process/host, and long-lived supervisor |
| Coding execution | Operator-authorized Python backend QA via pinned-image Docker, objective unittest, fence and sealed SHA-256 | End-to-end paid AI code generation not tested; JS/frontend/DevOps QA runners still denied |
| Protected code intake | Opt-in scoped bearer-authenticated `/api/v4` enqueue of backend roles (requires explicit operator readiness flag), frontend/DevOps still blocked | Production worker provisioning/health reconciliation and UI orchestration |
| Sandbox / image security | No Docker socket in public HTTP gateway; worker Docker read-only/no-egress/non-root limits; force cleanup and log flood cap | Dedicated production worker service/hard isolation, daemon authorization proxy, image admission/SBOM, DNS/egress policy |
| Budget | SQLite atomic approved cap; provider usage settlement with mocked HTTPS response | No real paid-provider bill verification; all chat, streaming, models, retries and invoices not reconciled |
| Authentication | Token-backed `/api/v4` project ACL, SSE, WS ticket, artifact hash; strict firewall closes legacy `/api/*` and preview/terminal routes | Legacy routes are closed rather than migrated; interactive cross-tenant user experience incomplete |
| Preview | Real disposable 2-stack React/Vite, FastAPI, PostgreSQL, SSE and WS with browser screenshots | Not a dynamic, authenticated production preview manager for arbitrary user projects |
| Frontend / 3D | Existing WFS navy–purple–gold, three-floor 3D and graceful WebGL fallback browser tests | GPU hardware profiling, real agent activity, accessibility and mobile device lab pending |
| Security scans | Scoped SAST, npm/pip audit, pattern secret scan | Full application SAST/secret history scan, penetration test, provider egress, container threat model pending |
| Backup & restore | SQLite WAL snapshot, digest checks, create-only offline restore | Atomic multi-DB production checkpoint and rollback rehearsal on Windows/Linux pending |
| Deployment | Legacy cutover guard remains; production not touched | Repeatable installation, integrated stack startup and cleanroom/rollback E2E pending |

## Phase 5 bounded measurable acceptance gates

Each checked gate is a **narrow automated contract**, not a guarantee that
all enterprise software-house requirements for that area are satisfied.

1. [x] Existing frontend unit suites and production build pass.
2. [x] Backend pytest / FastAPI integration tests pass.
3. [x] Chromium checks desktop/mobile primary UI and WebGL fallback.
4. [x] Durable queue enforces lease fencing, cancellation and bounded concurrent workers.
5. [x] Worker uses unique project/job/attempt workspace, not mutable shared `REPO`.
6. [x] Real Docker executes isolated Python unittest QA for two projects.
7. [x] Failed code, revoked lease and stdout flood cannot be approved as QA.
8. [x] SHA-256 artifact manifest is sealed and guarded by job/tenant authorization.
9. [x] Real sandbox runtime checks CPU/RAM/PID, user, readonly, egress and cleanup.
10. [x] `/api/v4` tests bearer authentication, scope, revocation and cross-project access.
11. [x] Scoped SSE/one-time WebSocket works behind a strict legacy firewall.
12. [x] CostLedger hard cap and actual-usage parsing are tested using mock provider fixtures.
13. [x] Two disposable fullstack previews run concurrently with different bearer tokens, ports and Compose projects.
14. [x] Scoped SAST, npm/pip dependency audit and pattern secret scan run in CI.
15. [x] Offline SQLite WAL snapshot and create-only, SHA-checked restore pass tests.
16. [x] Approved Python backend enqueue is opt-in; unsupported code roles stay denied.
17. [ ] Actual paid LLM usage reconciles chat, subagents, streaming and retries across providers and invoices.
18. [ ] Arbitrary user-selected fullstack stacks are dynamically built, isolated and served via authenticated reverse proxy.
19. [ ] Every legacy route has a compatible authenticated replacement; currently many legacy routes are intentionally closed.
20. [ ] Clean-room Windows/Linux setup, production-like backup and tested rollback on disposable hosts.
21. [ ] Real-device GPU WebGL performance, accessibility and 3D agent telemetry proven.
22. [ ] Production worker/daemon boundary with approved images, egress firewall, crash recovery and independent operator review.

**16 of 22 = 72.7% of these deliberately scoped Phase 5 checks**, CONDITIONAL
on a successful Actions run for the final HEAD. This is **not** overall project
completion or production readiness. If any latest CI job fails, mark the
affected gate unverified and recalculate.

## Operator safety

- No production server was modified, no live AI provider token was charged,
  and no production finance API or real user data was imported.
- Strict project mode intentionally blocks legacy chat, terminal and previews
  rather than pretending they have secure per-project credentials.
- Operator flag `WFS_CODE_QA_INTAKE_READY=YES` permits **queue admission** for
  Python backend jobs ONLY and must not be set before the separately
  authorized Docker QA worker is configured and validated.
- `WFS_MASTER_WORKER_ENABLED=YES`, `WFS_OPERATOR_APPROVAL=YES`,
  project-specific RBAC, approved budgets, image digest, HTTPS allowlist,
  and actual provider secrets remain separate explicit operator decisions.
- Database restoration never replaces existing paths, restarts services or
  performs a deployment cutover. Coordinate a maintenance window to ensure
  a coherent multi-DB checkpoint.
- Do not claim production-ready with any outstanding P0 listed here.

See [Phase 5 recovery runbook](PHASE5_RUNTIME_RUNBOOK.md) and
[Phase 6 handoff](NEXT_PHASE6_PROMPT.md).
