# WFS AI Office — Phase 31 supervised lease

Baseline `31d54c4376a0843145d3f9320103717aaf5b2abe` passed
[13/13 CI jobs](https://github.com/wawanwfs/AI-Office/actions/runs/43601627281).
Phase 30 accepted 56 of 62 scoped gates.

## Gate 63 — Supervised startup and crash recovery

- A supervised start persists closed gateway admission before activating
  Docker. Only its first worker can obtain the initial lease after verifying
  the current signed OCI approval and durable mTLS journal.
- Kill a real Linux watchdog process and verify that its replacement renews
  before the original deadline without restarting the preview. Kill the
  replacement, let the deadline elapse, and check that a later worker
  suspends the preview without renewing the elapsed lease.
- Confirm that gateway reads fail closed during the overdue interval,
  loopback is unreachable after suspension, the running PostgreSQL
  preserves a probe row, and a second tenant remains healthy.
- Keep Phase 28 rotation, Phase 29 BuildKit and Phase 30 signed
  revocation/expiry evidence intact. No volume deletion in policy stop.

Accept **57/63 scoped gates (90.5%)** only after exact branch, PR and
post-merge 13/13 checks pass with actual runtime evidence. This is one
disposable Linux host. It does not establish production readiness,
independent custody, host failure handling or Docker Desktop/WSL2 support.
