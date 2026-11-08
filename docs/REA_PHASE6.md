# WFS AI Office — Phase 6 REA: End-to-End Activation (bounded evidence)

**Audit date:** 2026-11-08. Initial Phase 6 HEAD
`deb1492e6ea076b28ab51749468a94a54f9d48df`.
Inherited acceptance checks in [Phase 5](REA_PHASE5.md).
This is **not** a production cutover and does not authorize paid AI usage.

## Actual implementations and falsifiable evidence

| Component | New proof | Remaining limitation |
| --- | --- | --- |
| User brief → persistent coding job | `src/components/SecureProjectPanel.jsx` submits a Python coding brief only to bearer-authenticated `/api/v4/projects/{project_id}/briefs`; server checks project ACL, real launch approval, queue state, approved budget and opt-in QA readiness before persisting task and queue job | Worker explicitly disabled unless separately provisioned; no actual user-provider paid request tested |
| Duplicate-request prevention | `backend/brief_intake.py`: SQLite `BEGIN IMMEDIATE` request fingerprint and per-project/principal hashed `Idempotency-Key`; concurrent retries result in one task. A crash before receipt finalization remains **pending/quarantined**, not silently re-executed | Operator reconciliation of interrupted intakes is not yet automated |
| Real engine → real QA | `scripts/ci_e2e_coding_worker.py`: real legacy `wfs_tasks` + `ApprovedMasterWorker` + durable queue + file writes + real Docker unittest + sealed SHA-256 manifest + `VerifiedArtifacts`. Two projects, **three passing tests per project**, cross-project artifact attempts denied. Verified source files are included in CI evidence ZIP | Model response is a **deterministic offline fixture**, NOT a real AI provider. QA tests are part of synthetic fixture, not independently specified customer acceptance tests |
| Streaming AI billing adapter | `backend/metered_stream_provider.py`: dedicated worker-side OpenAI-compatible SSE protocol, approved price/cap reservation before HTTP, actual final usage settlement, redirect rejection, cancellation/invalid JSON/unknown usage held for reconciliation | Provider network and invoice reconciliation not tested live; adapter buffers final text and is not yet wired to every chat/subagent/customer streaming path; DNS rebinding/network egress still needs hardening |
| Template preview lifecycle | `backend/preview_manager.py`: operator-only Compose manager with per-project immutable port reservation, hashed Compose name, separate token, start/logs/restart/stop and fail-closed uncertain state; `scripts/ci_dynamic_preview_operator.py` proves **two real Docker PostgreSQL stacks**, cross-token denial, restart, cleanup | **Fixed, reviewed example template only**. No arbitrary generated app admission, authenticated public reverse proxy, API-level management, or containment of outbound edge network |
| Security and CI | API TestClient/React Vitest, Python pytest, real Docker QA/preview, scoped SAST, npm/pip dependency audits and tracked-file secret-pattern scan | Full threat model, history-aware secret scan, container image admission, OS hardening, GPU hardware and external pentest missing |
| Windows/Linux recovery | Inherited approved offline SQLite snapshot/restore with path safety and WAL tests | Clean-room Windows Docker Desktop/WSL2 and Linux startup/rollback not yet proven on target hosts |

## Explicit Phase 6 acceptance gates

The Phase 5 denominator was **16 passed of 22 narrow checks**. Phase 6
adds five MORE narrowly defined tests, without deleting Phase 5 blockers.

23. [x] Authenticated project brief submission creates a persisted Python task
    and durable queued job; no immediate Docker or AI provider execution.
24. [x] SQLite idempotent intake prevents duplicate billable work on HTTP
    retries and concurrent requests; ambiguous crash state fails closed.
25. [x] Actual legacy task engine and authorized Master Worker produce real
    Python source files, pass real Docker QA and allow only content-verified
    project-scoped artifact download, using a clearly labelled offline model fixture.
26. [x] Buffered provider SSE adapter parses real-shaped token usage responses
    and settles reservations; invalid/missing usage, redirects, cancellation
    and cap failure are tested with **mock HTTP**, no provider account charged.
27. [x] Operator-only template preview dynamically assigns independent
    project names and ports, exercises real React/FastAPI/PostgreSQL stacks,
    cross-token isolation, restart and cleanup on disposable CI Docker.

**21 / 27 = 77.8%** of these bounded automated checks, *conditional on
successful GitHub Actions CI at the final HEAD.* This is **not** project
completion, functionality coverage, or production-readiness percentage.

### The six inherited unfinished checks (still open)

17. [ ] Actual paid LLM invoice reconciliation across chat, streaming,
    providers, subagents, retries and QA.
18. [ ] Arbitrary verified user-built full-stack project provisioning,
    network isolation, authenticated reverse proxy, WS/SSE and preview.
19. [ ] Every legacy route has a compatible per-project authenticated
    replacement. Strict mode still intentionally closes unsafe old routes.
20. [ ] Clean-room Windows/Linux setup and actual rollback on disposable
    infrastructure, including coherent multi-database snapshots.
21. [ ] Real device GPU/3D agent telemetry/performance and accessibility.
22. [ ] Production worker/daemon boundary, approved images, outbound network
    firewall, crash recovery and independent operator security review.

### Source of truth and deployment conditions

- All Docker tests occur inside **disposable GitHub Actions Ubuntu runners**.
- Browser screenshots of the primary WFS Office use a gateway-offline fallback.
  Fullstack template screenshots use actual backend/database inside CI Docker.
- DO NOT call synthetic fixture token counts "provider actual usage".
- `WFS_CODE_QA_INTAKE_READY=YES` only enables secured queue admission of
  Python backend tasks; worker/QA and spending approvals remain independent.
- The operator preview manager uses loopback ports only, no public preview
  proxy and no arbitrary customer build or image admission.
- Source-artifact SHA-256 integrity is not a complete cryptographic signed
  chain of custody against a compromised worker host.
- No production deployment performed; no paid provider key used.
- See [Phase 6 runbook](PHASE6_RUNTIME_RUNBOOK.md) and
  [Phase 7 handoff](NEXT_PHASE7_PROMPT.md).
