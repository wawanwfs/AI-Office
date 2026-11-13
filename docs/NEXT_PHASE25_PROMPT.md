# WFS AI Office — Phase 25 accelerated execution prompt

Start from exact green `main`. Review Phase 24 REA, the operator runbook,
the Phase 23 offline verifier, and the real two-tenant CI artifact. Preserve
all green gates. Do not force push, deploy, reset signing roots, or use
paid provider credentials.

## P0 — Separate release and runtime trust

1. Prove distinct writer, builder, verifier and operator identities on a
   disposable Linux host where possible. Restrict the Docker endpoint to the
   operator and avoid exposing it to the gateway or project tasks. Document
   actual OS identities and permissions, not just separate processes.
2. Give the operator a trusted, current release decision outside SQLite.
   Bind release freshness, revocation and a monotonic policy checkpoint
   to the approved OCI manifest. Test clock drift, valid old approvals,
   restored SQLite, expired evidence and cleanup after loss of approval.
3. Preserve sealed verification and load transport, mount-free Compose
   startup, and the two-tenant HTTP proof. Add continuous or periodic
   enforcement only with a bounded behavior and tested safe stop policy.
   Do not imply independent custody from synthetic CI.
4. Separately validate Docker Desktop/WSL2 if an appropriate host exists.
   Keep native Windows fail-closed and make no writable fallback.

Track offline dependency closure, external transparency and network
policy, public tenant HTTPS, coordinated recovery, live Office telemetry
and invoice reconciliation separately. Keep billable AI blocked until
the owner explicitly authorizes model, credential, price and hard caps.

Land at least one bounded code gate, confirm all 13 jobs on exact branch,
PR and merged main, and report SHAs, scoped progress and the next prompt.
