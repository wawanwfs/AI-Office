# WFS AI Office — Phase 28 signed journal rotation

Baseline `b53398c328c32146553811ed555768e6db49a78b` passed all 13 jobs in
[run 43472856004](https://github.com/wawanwfs/AI-Office/actions/runs/43472856004).
Phase 27 accepted 53 of 59 scoped gates.

## Gate 60 — Rotate a full release journal without resetting trust

- Verify a signed V3 bridge against the exact signed predecessor, retain
  global sequence numbers, and check external and durable anchors by both
  sequence and hash in the new bounded window.
- A bridge must preserve the prior release, decision, and validity period.
  A revoked release stays revoked. A separate signed decision is required
  to allow it again. An operator with no retained matching anchor fails closed.
- Provide offline prepare/assemble tooling that does not handle private keys
  or overwrite the active journal or archive.
- Exercise the 64-record boundary, a second rotation, revoked release,
  rollback, signed decision substitution and fork, and recovery in the
  actual mTLS and Docker two-tenant acceptance job. Preserve prior tests.

Accept **54/60 scoped gates (90.0%)** only after 13/13 exact branch, PR and
post-merge main checks pass. This is not production readiness.

The BuildKit daemon remains on the Phase 27 CI operator endpoint. The
separate BuildKit daemon, off-host publishing/custody and Windows Docker
Desktop/WSL2 are not certified. Rotation and signer custody here use one
disposable Linux runner and synthetic material.
