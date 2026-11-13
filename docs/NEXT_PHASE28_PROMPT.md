# WFS AI Office — Phase 28 accelerated execution prompt

Start from exact green main. Review Phase 27 REA, Linux custody runbook,
the real Docker proof, and durable anchor implementation. Preserve all
accepted gates. No force push, deployment, signing-root reset or paid AI.

## P0 — Separate BuildKit and rotate the bounded journal

1. Run BuildKit under its own dedicated unprivileged principal/endpoint.
   Do not grant it the operator daemon socket. Transfer the kernel-sealed
   reviewed context, confirm the independent verifier's output, and test
   that only the operator can promote the actual signed OCI artifact.
2. Define signed journal rotation that links the new generation to the
   independently retained old anchor. Test near the size limit, valid
   rotation, revoked releases, lost state, rollback and signed forks.
   Never silently discard trusted history or reset a signer root.
3. If infrastructure permits, host the publisher and policy custody
   independently and verify identity and administrative boundaries.
   Keep single-host evidence labeled as such.
4. Preserve two-tenant signed HTTP proof and Windows-native fail-closed.
   Add periodic enforcement only with a tested bounded lease and
   non-destructive stop. Keep volume deletion explicitly authorized.

Track offline dependency closure, external transparency/network policy,
tenant HTTPS, coordinated recovery, Office telemetry and invoice
reconciliation separately. Paid providers require owner approval for
model, credentials, price and hard caps.

Land at least one bounded gate, verify all 13 jobs on exact branch, PR
and merged main, and report the SHAs, scoped progress and next prompt.
