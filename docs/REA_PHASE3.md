# WFS AI Office — Phase 3 REA & Production Gates

Snapshot audit: 2026-11-08. Phase 3 baseline: `a22e9d40d8d00d886236fe36230606c45439e195`. This file tracks code and CI verification, **NOT** an active production deployment. See [Phase 2 matrix](REA_PHASE2.md).

## Real evidence and source of truth

- GitHub Actions: frontend Vitest + Vite production build, Python pytest and real Chromium smoke.
- Six Chromium screenshots: desktop landing, dashboard and 3D office; mobile landing/dashboard; WebGL unavailable fallback. **The browser test has no connected gateway** and indicates "Gateway offline".
- SQLite queue/cost/RBAC integration tests use temporary databases.
- AI request-cost adapter tests use mocked HTTPS provider responses and actual `usage` fields from fixture responses, not real paid provider calls.
- Container restrictions are verified as static configuration and subprocess mocks, **not** against an authorized Docker daemon.
- Six live infrastructure audits remain excluded from portable CI until run on an authorized host.
- No server deployment, live backup, or rollback rehearsal was performed.

## REA matrix

| Capability | Existing / Verified | Defective / Missing | Priority |
| --- | --- | --- | --- |
| Persistent queue | SQLite claim, concurrency, cancellation, retry, audit event log, lease fencing and quarantine tests | External work fencing after process crash not end-to-end, no distributed worker coordinator | P0 |
| Engine execution integration | Separate CLI worker invokes existing `wfs_tasks.run_task`; stage/status integration tested with stub engine | Real provider and Docker end-to-end not verified; task code roles intentionally disabled | P0 |
| Project-level RBAC | SQLite deny-by-default ACL + audited grants, worker checks enqueue and dispatch | No user-authenticated HTTP management UI, no enterprise identity provider | P0 |
| Launch approval | Legacy `require_launch_approval` still rechecked before execution | Approval workflow needs identity and revocation E2E in production | P0 |
| AI spending | Budget/price/hold/settlement in integer micro-USD; atomic cap tests; strict provider context | Requires manual prices and budgets, real provider instrumentation not production verified; forecast/alerts not built | P0 |
| AI provider transport | Worker-context HTTPS host allowlist, no auto-retries on uncertain paid responses, actual token usage enforced in tests | DNS/IP rebind protection, egress firewall, provider key vault and provider-specific token usage variants require infrastructure review | P0 |
| Sandbox isolation | Gateway compose no host networking, no Docker socket or provider secret mount; image no Docker CLI | Separate unprivileged build/test worker and project-specific Docker sandbox not yet operational | P0 |
| Legacy paid HTTP | Hardened `WFS_MASTER_QUEUE_REQUIRED` and `WFS_METERING_REQUIRED` block unmetered direct task/chat paths | User-facing metered chat integration not implemented | P0 |
| QA outcomes | Unknown QA verdict and failed/missing sandbox pytest now cannot be marked pass for code task | Full code role QA blocked in new worker; existing legacy API remains subject to secure-mode fencing | P0 |
| Workspace artifacts | Distinct project paths in worker, legacy shared sync skipped in worker mode | No secure artifact gateway or per-run Docker mount ownership checks | P0 |
| Dashboard / 3D | Existing React/Three scene and premium styling, real Chromium desktop/mobile and WebGL fallback | Not verified with live agent state and three-floor camera on real devices | P1 |
| Mobile UI | Screen captures and choice-card column regression | Further viewport/a11y audits and touch testing remain | P1 |
| Full-stack preview | Existing partial proxy, static scaffolds | Authenticated streaming WS/SSE terminal and per-project full-stack preview unverified | P1 |
| Observability | Queue events and cost history query APIs in offline Python layers | Central monitoring APIs, SSE UI, cost forecast, alerts missing | P1 |
| Deployment | Existing scripts and updated hardened compose, APPLY requires explicit new rehearsal flag | No Docker daemon test, server backup and actual rollback drill; Windows/Linux full-stack setup incomplete | P0 |
| Security scans | Test gates + safety-oriented static assertions | SAST/SCA/secret scan, dynamic scan, live cross-tenant attack tests missing | P0 |

## Measurable Phase 3 acceptance checks — narrow scope

A checked item means the explicitly described artifact has passing automated evidence; not that all production-grade implications have been proven.

1. [x] QA ambiguity and unavailable test results fail closed in unit tests.
2. [x] Durable cost ledger atomically enforces a per-project approved cap.
3. [x] Provider adapter consumes response token usage with mocked network and holds unknown charges.
4. [x] Master Queue exposes fencing, quarantine recovery and append-only auditable phases.
5. [x] Offline master worker dispatches through existing task engine in isolated tests.
6. [x] Worker enforces per-project ACL and rechecks launch approval in isolated tests.
7. [x] Hardened gateway manifests remove socket, host net and AI credential mount; Docker client removed from image.
8. [x] Strict mode rejects legacy unmetered paid HTTP + direct Docker exec.
9. [x] Real Chromium shows landing/dashboard/office and WebGL fallback with stored desktop/mobile evidence.
10. [ ] Live paid provider charge accounting including retries, all agents and chat.
11. [ ] Project-scoped Docker build/QA with separate privileged worker and runtime proof.
12. [ ] Fully authenticated RBAC API, JWT/session, and cross-tenant browser tests.
13. [ ] Authenticated full-stack WebSocket/SSE preview with artifact download and cleanup.
14. [ ] Real production-mode WebGL GPU/performance and multi-floor behavior on target devices.
15. [ ] Automated SAST/SCA + secrets scan + real Docker/network attack matrix.
16. [ ] Clean-room Windows/Linux install, backup/restore and verified rollback drill.

**9 / 16 = 56.25% of these bounded Phase 3 gates**, not percentage of overall AI Office development or real production readiness. Item 9 must be re-evaluated if subsequent browser workflow fails.

## Security posture and deployment warning

Hardened compose **intentionally disables** older Docker HTTP routes and unmetered paid chat/task calls. Do not deploy it without provisioning the independent worker, project ACL, provider budgets/prices, and a replacement for any disabled UX. Legacy `scripts/go_live_gateway_docker.sh APPLY` now refuses to proceed until the operator explicitly acknowledges a **new rehearsal**. A flag alone is not evidence of a successful rehearsal.

Do not enable `WFS_MASTER_WORKER_ENABLED=YES` and resume jobs until all IDs, HTTPS allowlists, vault/secrets, RBAC bootstrap, budgets and running service accounts are independently validated. A task is not "production verified" just because the queue reports `completed`.

## Verified next milestone

- Remove global mutable `wfs_tasks.REPO` in favor of immutable per-run workspace/context and atomic writes.
- Use isolated per-project worker containers with no host Docker socket in the HTTP gateway, a real preview proxy, and provider egress firewall.
- Introduce principal authentication to dashboard API and isolated budget/ACL management endpoints.
- Replace disabled legacy chat with a metered permissioned chat adapter.
- Test multiple worker crashes, out-of-order completions and invoice reconciliation against an approved provider test project.
- Complete Windows/Linux playbooks, backup/rehearsal screenshots, WebGL metrics and E2E accessibility/security.
