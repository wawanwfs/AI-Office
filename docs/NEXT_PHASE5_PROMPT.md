# WFS AI Office — Phase 5: Real Fullstack Software House Proof

Repo: https://github.com/wawanwfs/AI-Office, branch `main`.

Read current HEAD, `docs/REA_PHASE4.md`,
`docs/PHASE4_RUNTIME_RUNBOOK.md`, prior REA reports, queue, worker, HTTP
auth, runtime security report, and all current GitHub Actions. Preserve
working functionality. No unapproved production deployment.

## P0: Complete actual task execution

1. Remove all remaining mutable global execution/workspace dependencies
   from the legacy engine. Separate project IDs and immutable per-attempt
   staging areas; commit artifacts only with a fresh lease and reviewed QA.
2. Connect the dedicated project-scoped Docker sandbox runtime to real
   code-generation and QA tasks. Prove actual Docker CPU/RAM/PID controls,
   non-root, egress firewall, stdout/stderr, cleanup, cancellation and crash
   reconciliation for at least two independent projects. Eliminate shared
   legacy per-agent sandboxes.
3. Move Docker administration into an independently authorized worker
   (daemon proxy/rootless Podman or equivalent), away from public HTTP.
   Reject arbitrary images/commands/paths/volumes from clients and LLMs.
4. Apply authenticated project RBAC to **all** legacy gateway HTTP routes,
   with threat tests for tenant boundary, CSRF/session, websocket,
   streaming, artifact download and prompt log leakage.
5. Meter **every** paid path (chat, streaming, subagents, retries, providers)
   against immutable model prices, real response usage and hard cap.
   Reconcile missing, uncertain and disputed provider charges; no fake
   budget or "free" inference.
6. Implement actual fullstack project preview with isolated React/Vite,
   FastAPI, PostgreSQL and optional supporting services. Authenticated URL
   proxy, websocket/SSE, status, logs, QA output, artifacts, cleanup,
   startup/shutdown/restart/port-conflict/recovery tests.
7. Add dedicated operator UI with navy–purple–gold production-grade
   design for project permissions, approvals, budgets, agent events,
   task engine and live preview. Label ambient-only 3D animation simulated.

## Gates and delivery

Required green: Python/frontend tests; production build; real Docker
integration and multiple-worker crash/lease tests; API contract + tenant
attack matrix; SAST/SCA/secret scan; real Chromium desktop/mobile WebGL +
fallback; test Linux/Windows WSL2 deployments, backup, restore, rollback
and screenshots. Archive proof via GitHub Actions.

Push verified changes as `wawanwfs` to `main`, without force push.
Do not touch actual production servers. Finish with commit SHA, CI run,
new REA acceptance gate count and honest list of remaining P0 blockers.
Never claim production-ready before all gates and real runtime proof.
