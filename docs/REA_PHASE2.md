# WFS AI Office — Phase 2 REA Verification Matrix
Date: 2026-11-08

## Evidence boundaries

This matrix is for code currently committed to `main`, **not** for a deployed
production environment. Baseline was `9361614`, latest workflow checks are
linked from GitHub Actions. No working browser / WebGL session, real LLM
provider, external SaaS stack, or Docker daemon was used in these tests.

| Capability | REA state | Evidence or blocker | Priority |
| --- | --- | --- | --- |
| React app + 3D office | Existing / partial | Unit tests + Vite build; real GPU/WebGL E2E not verified | P1 |
| Projects, task board, chat UI | Existing / partial | UI test suite; no verified production full-stack deployment | P1 |
| Production task execution | Existing / partial | `backend_live/wfs_tasks.py`: approval, pause, claim, recovery guards; live API/provider validation missing | P0 |
| Sandbox code runs | Improved / verified in mocks | Unique per-run scripts, cleanup, concurrent tests; real Docker not checked | P0 |
| Sandbox isolation | Defective / open | Go-live host networking + Docker socket, no verified least-privilege runtime | P0 |
| Project status honesty | Improved / verified | SaaS state unknown instead of invented online; UI explicit unknown state | P1 |
| Preview scaffold input safety | Improved / verified | HTML meta escaped and demo claims removed; no browser pentest | P1 |
| Persistent Master Queue core | New / verified in tests | SQLite atomic claim, concurrency, idempotency, cancellation, retry, restart recovery | P1 |
| Master Queue worker integration | Missing | No authorized live dispatcher/worker fencing, queue intentionally starts paused | P0 |
| Provider token/cost ledger | Missing / not verified | No complete cross-provider metering / enforcement of budgets | P1 |
| RBAC + tenancy isolation | Partial / not verified | Need end-to-end auth and tenant boundary tests | P0 |
| Full-stack previews | Partial / not verified | Preview proxy exists; WebSocket/SSE + auth + real container runtime not E2E | P1 |
| Multi-project parallel execution | Partial | Admission limits in new ledger, not connected to running engine | P0 |
| Responsive accessibility | Partial | Existing UI tests; touch, reduced-motion and browser E2E incomplete | P2 |
| Live infrastructure audit | Not run | `WFS_RUN_LIVE_AUDITS=1` only on authorized configured host | P0 |
| Windows / Linux production install | Missing validation | Docs and existing deploy scripts, no proven clean-room full-stack install | P1 |

## Phase 2 acceptance gates (explicit, narrow denominator)

1. [x] CI baseline restored and passing (front/backend/build).
2. [x] Concurrent sandbox scripts isolated by execution and cleaned up.
3. [x] SaaS health defaults to unknown; UI does not fabricate green status.
4. [x] Project scaffold escapes untrusted HTML; QA claims corrected.
5. [x] Durable queue unit-tested (atomic claims, caps, cancel, retry, recovery).
6. [ ] Queue connected to *approved* production worker with external fencing.
7. [ ] Explicit owner RBAC and end-to-end project isolation.
8. [ ] Real provider token metering + durable budget approval / enforcement.
9. [ ] Verified Docker least privilege and security policy in a real daemon.
10. [ ] Real full-stack preview including WebSocket/SSE and shutdown/cleanup.
11. [ ] Browser WebGL+fallback E2E screenshots across desktop/mobile.
12. [ ] Clean-room Windows Docker Desktop/WSL2 and Linux deploy + restore/rollback.

**5/12 (41.7%)** of this *Phase 2 acceptance checklist* met by code/CI tests.
This is **NOT** an overall application completion or production readiness %
and may be revised as the acceptance scope changes.

## Safety notes

- The Master Queue never calls external AI services or starts Docker. It begins
  `paused=True` in its own control table; only a privileged worker/integration
  should resume dispatch.
- A queue lease/cancel is advisory; it is **not** an actual kill or proof of
  exclusive execution in remote processes. Enforce fencing with executor tokens.
- The CI skip of 6 live audits does not mean those services passed security.
- `saas.online = null` is intentional while health evidence is unavailable;
  the same wire object remains backward compatible.

## Follow-up implementation order

1. Production security: reject host Docker socket path for untrusted agent
   containers; use a separate worker service and explicit auth boundary.
2. Bridge approved task records to master-queue claims with a feature flag,
   with project-specific workspaces and idempotent execution ids.
3. Cost ledger and provider adapter instrumentation, enforced spending cap.
4. Real full-stack preview gateway with WebSocket/SSE, readiness and cleanup.
5. Accessible application UI redesign and real 3D GPU regression screenshots.
6. Deployment matrix with backups, migrations, rollback drills and alerts.
