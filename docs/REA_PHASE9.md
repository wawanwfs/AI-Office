# WFS AI Office — Phase 9 bounded REA, first implementation slice

Baseline: `df9bcd87b5e63829f386d13451da7b5630df3199`
(Phase 8 accepted 31/37 bounded gates, based on green main CI).
This milestone adds TWO narrow gate candidates, NOT completion of Phase 9.

## Gate 38 — Operator CLI signed approval (conditional)

- [x] Signed **existing v2** manifest bytes are canonicalized and
  domain-separated; detached Ed25519 signature is verified.
- [x] The reviewer public-key SHA-256 fingerprint is a REQUIRED,
  independently provisioned trust anchor. A key bundled in the manifest,
  a matching signature with an untrusted key, another signer, a bad signature,
  malformed encoding, symlink and RSA key are rejected.
- [x] Operator CLI requires the reviewer PEM, detached signature and pinned
  fingerprint for ALL actions, before manager initialization.
- [x] Native Windows/Linux signature unit regression tests; no private key
  or long-lived reviewer signing secret is committed, deployed or uploaded.
- [ ] The manager's internal CI/programmatic API still accepts trusted
  `reviewed_files` directly; this is operator-CLI signing, not universal
  enforcement across every possible custom caller.
- [ ] Independent identity verification/revocation, transparency log,
  signed SBOM content/provenance and image-registry attestation are NOT
  covered by a signed JSON. External verification of reviewer independence
  is an OPERATOR obligation.

## Gate 39 — Real container scoped network probes (conditional)

- [x] Two disposable tenant API containers tested with *direct* socket
  connections to public IPv4 HTTPS, metadata IPv4, public DNS TCP IPv4,
  public IPv6 HTTPS and public DNS TCP IPv6.
- [x] A clearly labelled local resolver-substitution test simulates
  DNS rebinding to metadata IPv4; a matching socket must be denied.
- [x] Actual running Docker API, DB and ingress network memberships checked
  against the expected internal/edge/ingress-public partitions.
- [x] Tests prove that operator Docker subprocess environment omits ambient
  proxy variables and provider API credentials, and that actual API
  containers carry no proxy environment variables.
- [ ] A simulated rebinding test is NOT a test against a real hostile DNS
  responder. Independent real DNS/IPv6 firewall and reverse path verification,
  public IPv6 routing, proxy-aware clients, DNS side-channel leakage, external
  bridge and all worker networks remain production blockers.

## Score

Conditional previous gates: **31/37**. If *both* new gates
and all inherited GitHub CI checks pass on the **final main commit**:
**33/39 = 84.6%** of narrowly defined automated acceptance gates.
Until then, mark Phase 9 added gates pending (**31/39**).
This number is NOT percent of project functionality or production readiness.

## P0 still blocked

- Paid provider/model/price/cap approval, real billable generation and
  verified official invoice reconciliation.
- **All** frontend/JS and backend/Python dependency SBOM completeness,
  wheelhouse with transitive SHA256 hashes and offline-reproducible build,
  registry-verified base-image SBOM/CVE and trusted signed attestation.
- Genuine DNS rebinding & IPv6 firewall tests, restricted daemon/rootless
  isolation, per-container disk limits and TOCTOU-race defense.
- Generic untrusted fullstack application admission, public authenticated
  tenant-bound HTTPS interactive HTTP/WS/SSE proxy.
- Windows 10/11 + Docker Desktop/WSL2 AND Linux true cleanroom encrypted,
  coherent multi-DB backup/create-only restore and disposable rollback.
- GPU/mobile real-device accessibility and three-floor live telemetry.

No production deployment, no official paid AI calls and no fabricated
provider usage. The previous fixed reviewed template remains the only
Docker preview admitted by the operator.
