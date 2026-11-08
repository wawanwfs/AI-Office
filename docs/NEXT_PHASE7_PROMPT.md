# WFS AI Office — Phase 7: Production Boundary & Real End-to-End Acceptance

Repository: https://github.com/wawanwfs/AI-Office
Branch: `main`

Read latest HEAD, GitHub Actions, `docs/REA_PHASE6.md`,
`docs/PHASE6_RUNTIME_RUNBOOK.md`, `docs/REA_PHASE5.md`,
`docs/NEXT_PHASE6_PROMPT.md`, the active gateway, Master Agent, task engine,
cost ledger, Docker runtime, preview manager, artifact store and frontend.
No force push. Preserve code and prior working features.

## Critical P0 (no production claim)

1. Authorize and verify a real official AI provider **only after explicit
   user-approved budget/model/provider**, and perform a real billed
   code-generation job with actual provider usage and independent invoice
   reconciliation. Never silently insert credentials or spend money.
2. Integrate every paid chat, streaming, task agent, subagent, QA, summary
   and retry path with a shared fail-closed metering policy; use true provider
   event usage, immutable model prices and strict caps. Build an operator
   reconciliation queue for uncertain costs and idempotency receipts.
3. Provision verified AI-generated React/Vite + FastAPI + PostgreSQL app
   source through an independent worker, with secure build/image admission,
   real integration tests and content-verified artifact publication.
4. Replace the template-only preview operator with a per-project runtime
   whose image/command/dependency policies are explicit and versioned.
   Implement authenticated preview gateway/URL proxy with tenant RBAC,
   HTTP, WebSocket, SSE, logs, live health and signed downloads. Keep
   user-provided code off the public gateway and deny outbound egress.
5. Complete a separate Docker daemon authorization boundary (rootless or
   scoped proxy), real egress/firewall DNS/SSRF protection, filesystem
   quotas, immutable image digests/SBOM, crash recovery, process termination
   and idempotent teardown tests on two or more independent projects.
6. Replace unsafe legacy HTTP endpoints with compatible project-scoped
   authenticated APIs. Test task/job/briefs, chat, preview, artifacts,
   terminal, logs, SSE and websocket tenant attacks; keep old routes
   closed until safely migrated.
7. Validate Windows 10/11 Docker Desktop/WSL2 and Linux clean-room
   installation with encryption at rest, coherent backup and restore,
   actual deployment/rollback on disposable machines, zero production
   server impact.
8. Connect real job telemetry and project events to all SaaS UI menus
   and high-fidelity 3D agent positions; clearly label ambient simulation.
   Test actual GPU, responsive mobile, keyboard and reduced-motion A11y.

## Acceptance and handoff

Require GREEN: Python/front unit and integration tests, Vite production
build, Playwright desktop/mobile, real Docker QA + preview lifecycle,
multiple tenants, API contracts, SAST/SCA/secret history review, external
network threat verification, authorized real provider and invoice
reconciliation, restore/rehearsed rollback. Upload anonymized artifacts.

Push compatible verified commits to `main` via `wawanwfs` without force.
Do not touch real production servers or spend on providers without explicit
user approval and verified rollback. Finish with full SHA, all workflow
run URLs, evidence ZIPs, REA numerator and denominator, and unresolved P0.
Never claim production-ready until P0 is actually proven.
