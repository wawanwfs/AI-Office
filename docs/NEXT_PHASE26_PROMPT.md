# WFS AI Office — Phase 26 accelerated execution prompt

Start from exact green `main`. Audit Phase 25 REA, its runbook, the
release-policy verifier, the OCI promotion code, and the two-tenant CI
artifact. Preserve all green gates. No force push, production deployment,
signing-root reset, or paid providers.

## P0 — Move release authority across real host boundaries

1. Prove distinct Linux writer, builder, verifier, and runtime operator
   principals on a disposable host. Give only the runtime operator
   access to its daemon socket, and verify that the gateway and project
   tasks cannot access it. Show actual UIDs and permitted filesystem
   boundaries. Do not treat separate processes as separate custody.
2. Publish current signed policy through an independently administered,
   authenticated service. Bind freshness, release approval, revocation,
   and a monotonic floor to an append-only checkpoint. Prove that stale
   time, replay, source unavailability and SQLite restore fail closed.
3. If implementing periodic enforcement, define a bounded lease,
   observable degraded state and non-destructive stop policy. Test
   revocation, network outages, operator recovery and verified restart.
   Keep deliberate data deletion separately authorized.
4. Preserve sealed OCI promotion and actual two-tenant HTTP proof.
   Validate WSL2/Docker Desktop only on a suitable host and retain
   fail-closed native Windows behavior.

Track offline dependency closure, external transparency/network policy,
public tenant HTTPS, coordinated recovery, live Office telemetry and
invoice reconciliation separately. Paid AI requires explicit owner
authorization for model, credential, pricing and spend caps.

Land at least one bounded gate. Verify 13/13 jobs on exact branch, PR
and merged main, report SHAs, scoped progress and limitations, and
publish an executable next prompt.
