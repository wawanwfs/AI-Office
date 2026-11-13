# WFS AI Office — Phase 27 accelerated execution prompt

Start from exact green `main`. Review Phase 26 REA, mTLS runbook and
two-tenant artifact. Preserve all accepted gates. No force push,
production deployment, signing-root reset or paid providers.

## P0 — Prove Linux identities and durable release custody

1. Provision a disposable Linux acceptance host with distinct writer,
   builder, verifier and operator UIDs. Give only the operator access
   to its runtime Docker socket. Prove real socket access from the
   operator and denial from the gateway/project task identity, plus
   expected artifact and key directory permissions. Preserve sealed
   OCI promotion and actual two-tenant signed HTTP evidence.
2. Move publication to an independently administered host or explicitly
   label a single-host test as such. Retain a durable trusted high-water
   anchor across process/SQLite recovery. Define and test safe bounded
   journal rotation, authenticated outage behavior and stale/fork denial.
3. If adding periodic enforcement, make it opt-in with a bounded lease,
   observable degradation and non-destructive stop. Verify recovery
   and require separate authorization for data deletion.
4. Verify Windows Docker Desktop/WSL2 only on suitable infrastructure.
   Keep native Windows fail-closed.

Keep offline dependency closure, external transparency/network policy,
public tenant HTTPS, coordinated recovery, live Office telemetry and
invoice reconciliation separately tracked. Paid AI needs explicit
owner authorization for model, credentials, pricing and hard spend caps.

Deliver at least one bounded gate. Check 13/13 CI on exact branch, PR
and merged main. Report exact SHAs, scoped progress and limitations,
and publish the next executable prompt.
