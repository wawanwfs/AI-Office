# WFS AI Office — Phase 29 separate BuildKit daemon

Baseline `a40e1325abd3626473da397ae4eb96edbaeaf3a3` passed all 13 jobs in
[run 43558642202](https://github.com/wawanwfs/AI-Office/actions/runs/43558642202).
Phase 28 accepted 54 of 60 scoped gates.

## Gate 61 — Build and promote under different Linux principals

- Use a private rootless BuildKit daemon, not the runtime Docker builder,
  for the actual approved OCI archive. Check the socket peer credentials
  and the daemon's kernel user namespace mapping.
- The builder's client checks the SHA-256 and kernel seals of the original
  stdin file descriptor. It exports only the OCI archive. The builder
  and verifier cannot connect to the runtime Docker socket.
- A separate non-root verifier reads the same archive through a read-only
  descriptor and checks the reviewed API, frontend assets, platform and
  OCI descriptors before the synthetic witness signs. The existing
  signature verifier and operator admission still run.
- Prove the archive image ID is absent from the operator daemon before
  admission and only the operator promotes it for the two tenants. Preserve
  mTLS journal rotation, signed HTTP, runtime cleanup and Windows-native CI.

Accept **55/61 scoped gates (90.2%)** only after 13/13 exact branch, PR and
post-merge main checks and the actual runtime proof. This is not
production readiness. Root administration is shared within one
disposable GitHub runner. Off-host custody, dependency closure, tenant
HTTPS and Docker Desktop/WSL2 are outside this acceptance.
