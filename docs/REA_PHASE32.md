# WFS AI Office — Phase 32 service-supervised lease

Baseline `8333d25ec299b6bc03638695717cf32947802e9d` passed
[13/13 CI jobs](https://github.com/wawanwfs/AI-Office/actions/runs/43606950408).
Phase 31 accepted 57 of 63 scoped gates.

## Gate 64 — Whole-supervisor recovery with boot-scoped leases

- Use actual systemd units to start and recover the signed preview.
  Kill the entire recovery service cgroup, including its worker, and
  require a replacement MainPID and a renewed lease without a new API
  container. Recovery never invokes startup and does not need a token.
- Let the persisted lease expire with the service stopped. Gateway
  reads must be denied before recovery. Restart the recovery-only
  service and verify non-destructive shutdown, preserved PostgreSQL
  data, a healthy neighbor and the durable mTLS journal high-water mark.
- Bind renewed leases to the Linux boot ID. Unit tests verify rejection
  of a persisted prior-boot lease even with a future wall-clock expiry.
- Retain Phase 28–31 evidence and Windows-native checks.

Accept **58/64 scoped gates (90.6%)** only with 13/13 exact branch, PR
and post-merge CI and the dynamic runtime evidence. The systemd service
restart runs on one disposable Linux runner. There is no real host
reboot, off-host custody, or Docker Desktop/WSL2 certification.
