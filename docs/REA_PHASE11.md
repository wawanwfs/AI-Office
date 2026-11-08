# WFS AI Office — Phase 11 bounded REA: staged build + local epoch floor

Baseline green `main`: `f42fa9ef4a36818b8b3d6d516a2e54581545086b`.
Inherited Phase 10 acceptance **35/41** narrowly defined automated gates.
This phase proposes TWO additional scoped gates, not full Phase 11 delivery.

## Gate 42 — Locally durable reviewer policy epoch floor

- [x] Reviewer policy epoch + SHA-256 are recorded in the private
  operator SQLite registry, under `BEGIN IMMEDIATE`.
- [x] Reject a lower epoch even if the old Ed25519 signature and independently
  pinned old policy are still valid; reject a DIFFERENT policy at equal epoch.
- [x] Apply on manager construction, reserve, status, transitions and Docker
  invocations. A newer epoch requires a freshly authorized policy and manager.
- [x] Regression tests exercise valid upgrade, valid signed old-policy replay,
  equal-epoch policy substitution, same-registry process restart and no Docker.
- [ ] This is **not** tamper-resistant anti-rollback across deletion/replacement
  or a restored backup of the SQLite registry. External append-only log,
  hardware monotonic counter, signed roster, independent identity/revocation
  distribution, and privileged OS ACL attestation are not proven.

## Gate 43 — Project-scoped byte-verified Docker Compose staging

- [x] Copy the exact four reviewed Compose/API/ingress/build files, exact
  frontend inventory, root package-lock and CycloneDX SBOM from the SAME
  file-descriptor bytes that are checked against signed v2 digests.
- [x] Publish a complete private repo-shaped tree under the operator
  `preview-snapshots/<project-hash>` path only after validating it. Docker
  Compose uses this staged `compose.yaml` for **ALL** lifecycle commands.
  The Docker build context and frontend / ingress bind mounts resolve
  relative to the staged tree, not the live checkout.
- [x] Reject a source replacement *during* file copy, a symlinked staged
  source and altered staged assets; prevent Docker mutation without admission.
- [x] Two real Docker tenant stacks in CI: mutate original source while a
  real `docker compose up -d --build` is executing, then restore original;
  verify the copied staged bytes remain unchanged and running stack passes
  project-specific health/auth checks.
- [x] Snapshot removed only after authorized successful disposable
  `docker compose down --volumes`. If the result is uncertain, leave
  state for manual reconciliation.
- [ ] Project-owned staging is NOT a read-only bind mount / immutable FS
  when a hostile actor can write files as the same operator user; a malicious
  privileged daemon or same-user code may still race staged bytes.
- [ ] Base-image OCI provenance, online pip installs inside Dockerfile,
  complete Python/JS SBOM and network isolation outside CI remain unproven.
  This is not full reproducible/offline Docker build or complete TOCTOU proof.

## Narrow score, CI qualification

If **all 13 inherited/new GitHub Actions jobs** pass on the final merged
`main` commit, narrow accepted total becomes **37/43 = 86.0%**.
Until that exact evidence exists, record **35/43** accepted / 2 pending.
The percentage measures these particular acceptance gates only, NOT
overall functional parity, cybersecurity certification or production readiness.

## Unfinished Phase 11 and P0 blockers

1. Signed, independently verified reviewer-roster authority and cross-device
   monotonic policy; OS-protected immutable builder workspace and race defense.
2. Full Python/JS/OCI independently vetted transitive SBOM, offline
   reproducibility, verified image signatures and CVE/attestation review.
3. Controlled authoritative real DNS rebound; IPv4/IPv6, proxy-aware and
   host-egress firewall, storage quota, restricted/rootless daemon proofs.
4. Isolated-QA-approved arbitrary generated source; public tenant TLS
   interactive HTTP/WS/SSE with strict RBAC, origins and browser testing.
5. Real paid AI provider model, credential/price/spend-cap approval and
   independent invoice-based metering verification.
6. Windows Docker Desktop/WSL2 and Linux encrypted coherent multi-DB cleanroom
   create-only restore, actual rollback, accessibility/GPU and live telemetry.

**No production action, no AI provider spend, no arbitrary model Dockerfile.**
CI uses a synthetic ephemeral reviewer, NOT independent authorization.
