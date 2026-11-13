# WFS AI Office — Phase 27 Linux custody

Baseline `a0dc0d56421d9872b0ff9027cbcfc4b216298743` passed all 13 jobs in
[run 43458268969](https://github.com/wawanwfs/AI-Office/actions/runs/43458268969).
Phase 26 accepted 52 of 58 scoped gates.

## Gate 59 — Linux custody checks and rollback denial after restart

- Test the real Docker daemon Unix socket from distinct non-root Linux
  identities. The existing runtime operator gets HTTP 200 from `/_ping`.
  Writer, context builder, verifier, gateway and task probes must receive
  kernel EACCES. Prove per-role read/write restrictions on representative
  staging, OCI and client key files.
- A builder UID verifies and seals the reviewed input, reproducing the
  actual BuildKit context digest. A verifier UID independently verifies
  the actual approved OCI archive. Preserve the real two-tenant sealed
  promotion and signed HTTP verification under the CI operator.
- Optionally persist the authenticated journal tip using a locked,
  private anchor file with fsync and atomic replacement outside preview
  SQLite. Deny missing or insecure custody files, verify the external
  anchor as well, and persist revocations before denying them.
- Verify old history is denied after publisher and operator reopen and
  after SQLite restore. A valid append recovers without deleting data.

Accept **53/59 scoped gates (89.8%)** when all 13 checks pass on exact
branch, PR and merged main. The scope is not production readiness.

This is one disposable host and a privileged fixture supervisor. It is
not a fully separated BuildKit deployment. BuildKit itself still uses
the CI operator daemon. The gateway and task UID probes represent
restricted principals, not production service accounts. No off-host
custody, protected external storage, journal rotation, watchdog, or
Docker Desktop/WSL2 proof is claimed.
