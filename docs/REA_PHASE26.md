# WFS AI Office — Phase 26 authenticated release journal

Baseline `713f2f7e817dc79d1ab8efc3b217322c399f6344` passed all 13 jobs in
[run 43449258299](https://github.com/wawanwfs/AI-Office/actions/runs/43449258299).
Phase 25 accepted 51 of 57 scoped gates.

## Gate 58 — Fetch and verify release history over mTLS

- Require CA/hostname validation, a pinned server certificate, and the
  server-side client CA and leaf pin. The read-only reference server has
  no policy signing key and no mutation API.
- Verify a bounded, domain-separated signed hash chain, an independently
  provisioned sequence/hash anchor, and the highest observed authenticated
  tip within the operator process. Deny replays, forks, wrong release,
  stale or future decisions, and unavailable sources without fallback
  when operating in remote mode.
- Exercise real two-tenant Docker and signed HTTP assets with remote
  policy, revocation after SQLite restore, truncated history, recovery
  under a newer anchor, and outage while the running service stays intact.
  Preserve Phase 25 file-based mode for deliberately offline operators.

Once all 13 checks pass on the exact branch, PR and merged main, accept
**52/58 scoped gates (89.7%)**. This does not measure production readiness.

Reference CI runs the publisher, synthetic signer and operator on one
runner. The server's observed history and the operator's high-water mark
are process-local. Across restarts a current external pin is required.
There is no independent off-host administration or WORM store, continuous
watchdog, Windows Docker Desktop proof, or separated Docker OS identities.
