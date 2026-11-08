# WFS AI Office — Phase 4: Full-Stack Execution & Production Proof

Repository: https://github.com/wawanwfs/AI-Office
Branch: `main`

## Baseline

Read current HEAD, `docs/REA_PHASE3.md`, `docs/REA_PHASE2.md`,
`docs/master-queue-phase2.md`, deploy compose, latest Actions and every
relevant backend/ frontend/source contract. Preserve proven functionality.
Do not deploy to a live host.

## Priorities (do these before more visual features)

1. **Execution isolation P0:** remove shared global `wfs_tasks.REPO` and all
   shared per-agent code paths; use `ContextVar`/per-run immutable workspace,
   dedicated least-privilege worker service, secure Docker API boundary,
   project-scoped containers and frozen artifacts. Prove real Docker runtime
   concurrency, CPU/RAM/capability controls, egress denial and cleanup.
2. **True production auth P0:** authenticated principal and RBAC behind HTTP
   gateway (not trusted browser header), per-project authorization on preview,
   logs, tasks and artifacts, CSRF/session/JWT discipline, security audit.
3. **Complete metering P0:** integrate `CostLedger` with every billable path
   including chat, retries and model provider variants; handle streaming,
   usage missing, disputed/unknown charges, approvals, forecasts and alerts.
   Never assume prices. Verify against authorized real provider test traffic.
4. **Production Master Worker P0:** lease fencing at physical side-effect
   boundary, cancel/terminate containers and LLM stream, crash restart and
   idempotency, deterministic retry limits, queue/event audit and budget cap.
   Validate multiple workers and parallel independent projects.
5. **Preview P1:** real React/Vite + FastAPI + PostgreSQL environments,
   authenticated reverse proxy supporting HTTP + WebSocket + SSE, terminal
   policy, download signed artifacts, healthchecks, startup and teardown.
6. **Product UI P1:** real Monitoring, Project, Agent, Budget, Approval,
   Editor and Preview panels. Use navy/purple/glass/gold design, functional
   controls, accessible keyboard/mobile behavior and three-floor 3D.
7. **Verification P0:** GitHub tests, static/dependency/secret scans, Docker
   integration, API contract, real browser screenshots, WebGL GPU fallback,
   Windows Docker Desktop/WSL2 and Linux dry-run, encrypted backup/restore,
   rollback drills. Upload evidence to Actions artifacts.

## Required handoff

Push only verified backward-compatible commits directly to main using
authenticated `wawanwfs` and no force push. Report full commit SHA and CI run,
working functionality vs simulation vs partial vs absent, blockers and
measurable acceptance checklist. Never call the system production-ready with
any remaining P0 blocker; do not activate production deployment.
