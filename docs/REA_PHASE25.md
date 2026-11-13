# WFS AI Office — Phase 25 release policy checkpoint

Baseline `701ce5d9c00ea1dcc5043e82bd89f8ebd78057f8` passed all 13 jobs in
[run 43447854039](https://github.com/wawanwfs/AI-Office/actions/runs/43447854039).
Phase 24 accepted 50 of 56 scoped gates.

## Gate 57 — Require current signed release policy outside runtime SQLite

- Validate a domain-separated Ed25519 allow/revoke decision from a pinned
  key distinct from the release witness and source reviewer. Bind it to
  the exact OCI manifest, approval SHA-256 and platform.
- Require an external head pin and monotonic sequence floor. Reject
  absent, replaced, stale, explicitly revoked, or older decisions, with
  a maximum 10-minute lifetime and a 30-second future clock tolerance.
- Check before Docker and recheck before Compose activation or restart.
  Retain native Windows fail-closed and the Linux sealed OCI path.
- Preserve the two-tenant Docker and HTTP proof. Restore a real older
  SQLite snapshot with the prior approval hash and show that current
  policy still rejects rollback and revocation. Require explicit data
  loss authorization for cleanup and a higher signed allow decision for
  recreation in the disposable CI scenario.

Gate 57 remains pending until all 13 jobs pass on exact branch, PR and
merged main. The scoped total then becomes **51/57 (89.5%)**. This is not
a production-readiness percentage.

CI uses a separate synthetic signing key on the same runner. It does not
prove separate OS identities, off-host key custody, a trusted external
clock, remote append-only revocation, continuous enforcement, daemon
resistance or Docker Desktop/WSL2 compatibility.
