# WFS AI Office — Phase 7 REA & Production Boundaries

Baseline: Phase 6 HEAD bee20468e9a377568c54c86973e94bcc13093773.
All CI Docker stacks and Windows jobs are disposable, not production.
Actual paid AI provider integration is NOT authorized or tested.

## Delivered and verifiable

| Capability | What was actually tested | Unfinished boundary |
| --- | --- | --- |
| Authenticated preview inspection | Project RBAC, read-only operator registry, loopback-only numeric port, bounded response, no redirect or browser token forwarding; two real Docker/PostgreSQL tenants reject cross-project bearer | This is read-only inspection, not interactive HTML/WS/SSE public proxy |
| Docker lifecycle | SQLite immediate-transaction fencing blocks concurrent start; idempotent cleanup, two project stacks | Dedicated production Docker daemon API authorization, restart reconciliation |
| Egress and preview ingress | API and DB use only Docker internal bridges. Reviewed digest-pinned nonroot TCP ingress has host loopback port. Real CI verifies outbound socket denial to 1.1.1.1 and 169.254.169.254 while HTTP, SSE, WS and PostgreSQL remain healthy | Host firewall, IPv6, DNS rebinding, all-image admission/SBOM, arbitrary generated code |
| Billing discrepancy audit | Local SHA256 manual invoice receipts, exact micro-USD, immutable records, mismatch and cross-tenant tests, owner-only audit API; CostLedger funds never silently released | Actual provider invoices NOT independently verified; metering still not complete across all billable AI paths |
| Native Windows file handling | Windows GitHub runner exercises WAL snapshot/restore, SQLite URI paths, corrupt snapshot rejection and secure auth; explicitly close connections and fsync through writable handle | Windows 10/11 Docker Desktop/WSL2 clean-room integration and full rollback remain unverified |
| Real UI data | Secure project panel fetches QA manifest, preview health, and invoice findings using project-scoped bearer; no token persistence | Real complete software house UI and GPU telemetry missing |

## Narrow acceptance matrix

Inherited Phase 6 result: 21 / 27 gates passed. Six NEW narrow gates:

28. [x] V4 preview read-proxy blocks cross-tenant reads, SSRF paths, redirects, large bodies, unauthenticated access, and validates two actual Docker PostgreSQL upstreams.
29. [x] Concurrent operator start and idempotent teardown are fenced by SQLite transitions.
30. [x] API and DB internal networks, pinned nonroot ingress, loopback HTTP/WS/SSE and rejected direct IPv4 egress proven on disposable Docker hosts.
31. [x] Immutable manual invoice discrepancy record, exact amount, unknown-charge hold and owner-only reporting pass tests. Does NOT mean official invoice verified.
32. [x] Native Windows runner verifies WAL/create-only restore and scoped API tests. Does NOT mean WSL2/Docker Desktop installed or production rollback tested.
33. [x] React tests prove QA-manifest, preview-health and owner-billing UI data sources, not simulated statuses.

**27 of 33 = 81.8%** of narrowly scoped gates after a GREEN
GitHub Actions run for the final HEAD. If a gate fails on final CI, its
checked state is conditional and numerator must be reduced. This is NOT
overall completion or production readiness.

## Unfinished production blockers (inherited)

17. [ ] Authorized real official AI provider + actual invoice reconciliation across chat, streaming, retries, subagents, QA and summarization.
18. [ ] Arbitrary QA-approved generated fullstack app provisioning with authenticated interactive HTTP/WS/SSE proxy and independent network/build admission.
19. [ ] All unsafe legacy routes replaced by project-scoped authenticated endpoints; legacy remains deliberately blocked.
20. [ ] Windows/Linux cleanroom Docker installation, coherent encrypted multi-DB backup, deployment and tested rollback.
21. [ ] Actual GPU 3D performance, accessibility and realtime agent telemetry proof.
22. [ ] Production Docker daemon and worker isolation, all images pinned, SBOM, DNS/SSRF/IPv6/firewall, storage quota and independent security review.

Source code generated in CI for Phase 6/7 uses a clearly labelled
deterministic OFFLINE FIXTURE, not an official paid LLM.
Manual invoice SHA256 evidence does not substantiate actual provider costs.
The demonstration does not use customer or production data.
No production server, financial account or paid provider was touched.

See PHASE7_RUNTIME_RUNBOOK.md and NEXT_PHASE8_PROMPT.md.
