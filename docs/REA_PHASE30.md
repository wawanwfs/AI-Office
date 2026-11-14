# WFS AI Office — Phase 30 bounded release lease

Baseline `97718493077ec8452a309809aa3e415273762070` passed
[13/13 CI jobs](https://github.com/wawanwfs/AI-Office/actions/runs/43588947721).
Phase 29 accepted 55 of 61 scoped gates.

## Gate 62 — Stop serving an unauthorized watched preview without deleting data

- The operator watch verifies the pinned OCI approval and polls the existing
  mTLS journal with its existing durable and external anchors.
- Cap renewals at 15 seconds and at the earliest signed expiry. A failed
  check cannot renew a lease. The in-process monotonic watchdog does not
  wait indefinitely for a blocked journal request.
- After a denial, stop only the recorded tenant's API and ingress using
  exact Compose labels and its registered API ID. Preserve PostgreSQL
  and its data. Volume deletion still requires explicit operator approval.
- Exercise actual signed revocation and expiry on two Docker tenants.
  Assert tenant isolation, preserved database rows, gateway and loopback
  denial, durable journal high-water state and the existing cleanup.
- Preserve Phase 29 rootless BuildKit, independently verified OCI
  promotion, signed HTTP and Windows-native fail-closed checks.

Accept **56/62 scoped gates (90.3%)** only after all 13 exact branch, PR
and post-merge jobs pass with the runtime evidence. This is not
production readiness. The watch is opt-in and runs on one disposable
host. No independent off-host custody or Windows Docker Desktop proof
is claimed.
