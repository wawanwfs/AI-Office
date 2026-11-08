# WFS AI Office — Phase 10 bounded REA (first verified slice)

Baseline at branch creation: `5c80ecf9584582a860c9bc5ddca9d581d725e4eb`.
Previous Phase 9 narrowly accepted **33/39** gates on green main CI.
This work introduces TWO additional, strictly scoped gate candidates.
Neither marks the comprehensive Phase 10 prompt finished.

## Gate 40 — Signed review admission on ALL managed preview operations

- [x] Manager constructor rejects an unsigned manifest even when code supplies
      valid v2 hashes and `enabled=True`; no source-only bypass remains in
      any known manager callsite, including the disposable two-stack CI proof.
- [x] `SignedPreviewAuthority` validates a separately pinned operator-owned
      policy SHA-256, nonempty active Ed25519 reviewer roster, explicit
      revocations and epoch, rejecting missing, malformed, duplicated keys.
- [x] Ed25519 approval signature and the full reviewed runtime byte inventory
      are re-verified before manager reservation/status/transition and Docker
      invocation. Policy/signature mutation DENIES further operations.
- [x] Key rotation requires an explicitly re-pinned policy and new manager
      authority; old manager refuses changes to its trust anchor.
- [x] Regression tests cover unsigned entry, post-start signer corruption,
      edited policy, revoked signer, rejected malformed policy and rotation.
- [ ] Signature and reviewer authority verification occurs in a trusted
      Python process; it is **not** a security boundary against hostile Python
      code injected into that same process. OS file permission, independent
      reviewer attestation, revocation distribution and durable monotonic
      policy epoch enforcement remain unproven.
- [ ] TOCTOU-safe source snapshot for Docker/Compose build still absent.
      Hashing prior to command invocation is not a guarantee that files
      cannot change during Docker build.

**CI qualification:** Current Docker lifecycle tests use an ephemeral,
self-generated *synthetic* signer, deliberately not independent production
operator approval. Never reuse the CI signer for real approval.

## Gate 41 — SHA256 hash-locked offline install for one Python dependency slice

- [x] In disposable GitHub Ubuntu CI only, download binary wheelhouse of
      `requirements-preview-crypto.txt` and all resolved transitive wheels.
- [x] Record each wheel's package, version and SHA256; generate an ephemeral
      `--require-hashes` lock and install with `--no-index --find-links`.
- [x] Modify a downloaded wheel byte sequence and prove that the same
      hash-locked offline install rejects it.
- [ ] Wheelhouse comes from the normal CI-configured online package index.
      Its ephemeral hashes are generated from the same downloads;
      independent registry authentication, signature/attestation and
      offline reproducibility across architectures are NOT established.
- [ ] Full backend Python/JS transitive coverage, OCI image signatures,
      base-image SBOM/CVE review and actual offline Docker build remain P0.

## Conditional scoped score

Prior: **33/39**. If final merged `main` GitHub Actions are fully green
(including Windows-native regression tests, both real Docker tenants and the
new offline-wheelhouse job), record **35/41 = 85.4% of narrow acceptance gates**.
Until then the new gates are PENDING and the verified count remains **33/41**.
These numbers are NOT percentages of total functionality or readiness.

## Explicit P0 blockers

1. Complete independently signed build provenance, verified transitive
   Python+JS/OCI SBOMs, hash-locked cross-platform wheelhouse and no TOCTOU.
2. Real controlled authoritative DNS rebinding, public IPv4/IPv6, proxy
   egress and disk limit verification on a restricted Docker daemon.
3. Isolated-QA-approved arbitrary source, tenant-isolated authenticated
   interactive HTTPS HTTP/WS/SSE reverse proxy and end-to-end RBAC revocation.
4. Real provider/model/spend-cap approval, trustworthy provider billing
   evidence and official invoice reconciliation.
5. Cross-platform encrypted coherent multi-database create-only restore,
   full rollback and cleanroom Docker Desktop/WSL2 tests.
6. Real mobile accessibility, GPU/performance and live office telemetry.

No forced history, no production deployment and no billable AI requests.
