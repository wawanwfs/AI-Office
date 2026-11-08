# WFS AI Office — Phase 6: End-to-End Software House Activation

Repository: https://github.com/wawanwfs/AI-Office
Branch: `main`

## Baseline and do-not-regress

Read the latest branch HEAD, GitHub Actions, `docs/REA_PHASE5.md`,
`docs/PHASE5_RUNTIME_RUNBOOK.md`, `docs/REA_PHASE4.md`,
`docs/NEXT_PHASE5_PROMPT.md` and all relevant backend/frontend modules.
Preserve verified queue, Python QA, limited Docker sandbox, scoped v4 auth,
two-stack demo preview, SAST/SCA, secret scanner, and offline SQLite restore.
The repo may have concurrent writers; always rebase logically onto the
latest HEAD; do NOT force-push.

## P0 — Real end-to-end goal

1. Connect the actual Master Agent and frontend task intake to the isolated
   worker so a user-entered software brief creates real code files and tests,
   with approved budgets, explicit operator approval, signed/fenced artifacts,
   and truthfully reported task status. Test an authorized real provider
   project with costs/invoice reconciliation, not just mocked usage.
2. Implement provider adapters for ALL billable paths: chat, LLM streams,
   agent and subagent calls, retries, output summarization, QA. Support
   provider-specific usage accounting, pricing approval, unknown charges,
   hard caps, request idempotency, cancellation and invoice reconciliation.
   No assumed model prices and no hidden unmetered provider call.
3. Replace the fixed two-project Compose demo with a dynamic, authenticated
   Preview Manager. Support arbitrary React/Vite, FastAPI and PostgreSQL
   projects; restricted image/build admission; per-project networks, databases,
   ports and ephemeral secrets; signed artifact URLs; authenticated HTTP,
   WebSocket, SSE, logs, restart, health check, teardown and crash recovery.
4. Fully separate worker OS/container privileges from HTTP gateway. Apply
   restricted daemon API, image allowlists/digest pinning, egress firewall/DNS
   defense, resource limits, workspace and disk quotas, safe stdout handling,
   cancellation and no leftover containers after failures.
5. Migrate legacy gateway routes to authenticated per-project replacements
   or preserve strict denial. Never reopen chat, terminal, logs, artifacts,
   preview or cross-tenant routes without an objective permission boundary.
6. Create a multi-project integration test with actual code output,
   browser-visible preview, backend API, PostgreSQL data isolation,
   WebSocket/SSE and verified QA/cost evidence.

## P1 — Product and deployment

7. Complete navy–purple–gold UI for Dashboard, Projects, Orchestrator,
   agents, permissions, budgets, monitoring, terminal, editor, QA and preview,
   using actual backend events. Clearly mark ambient 3D animation as
   simulation until it is bound to real job telemetry. Test WebGL on GPU
   hardware, fallback and reduced-motion/mobile accessibility.
8. Validate clean-room installation on Windows 10/11 Docker Desktop/WSL2
   and Linux, environment repair, encrypted snapshots, multi-DB consistency,
   create-only restore, deployment rehearsal and actual rollback with
   independent evidence.

## Acceptance gates and evidence

Mandatory: all npm/Python tests, Vite build, React/FastAPI/Postgres integration,
real browser desktop/mobile screenshots, scoped API contract and tenant attack
tests, Docker concurrent and stdout flood tests, SAST/SCA/history-aware secret
scanning, paid-provider billing reconciliation, Windows/Linux install and
backup/restore/rollback rehearsal. Upload anonymized evidence to GitHub Actions.

Push verified compatible commits using `wawanwfs` to `main`, no force push.
Do not touch actual production servers without explicit permission, validated
backups, change plan and tested rollback. Finish with full commit SHA, green
CI runs, runnable artifact links, REA gate denominator and remaining P0.
**Never claim production-ready with any unfinished P0.**
