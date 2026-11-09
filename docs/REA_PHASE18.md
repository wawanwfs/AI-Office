# WFS AI Office — Phase 18 bounded REA: pinned HTTPS two-endpoint gossip

**Baseline:** 9323297b5a83da753a1ca6151c260542a6a17e5e (latest green main at start of Phase 18). Previously accepted: **43/49 scoped gates**.

This work proposes **one** additional P0 trust verification gate. It does not complete the full accelerated Phase 18 execution prompt.

## Gate 50 — independently pinned HTTPS certificate + signed Merkle gossip between two test endpoints

- [x] Optional real TLS 1.2+ transport on the existing loopback reference log using separately provisioned certificate and TLS private key. Previous unauthenticated HTTP routes are not exposed; the existing bearer authentication remains mandatory for all requests.
- [x] New operator verifier requires two distinct HTTPS origins and **different pinned TLS leaf certificate hashes**. Both certificates must chain to explicitly provisioned trusted CA PEMs and pass hostname verification. Each actual handshake independently checks the peer DER SHA256 against the out-of-band pin; no insecure HTTP fallback, redirects, automatic proxies or client-selected arbitrary paths.
- [x] The verifier independently pins the log's Ed25519 raw public-key fingerprint, checks the exact domain-separated signed Merkle tree-head bytes on BOTH endpoints, and verifies RFC6962 inclusion and prefix-consistency proof paths against the separately archived earlier tree size/root.
- [x] Same-size conflicting signed roots raise a **fork alarm**. Smaller heads than the operator's trusted size raise rollback denial. Prefix-consistent but lagging mirrors also fail closed; a missing, unauthorized, TLS-invalid or offline endpoint fails closed.
- [x] New Windows-compatible operator CLI reads independent bearer tokens from environment variables, not command-line arguments, and outputs only non-secret digest and status metadata. It never accepts pins from the network response itself.
- [x] CI creates two real TLS servers in **distinct operating-system processes** with distinct test-only certificates, journals and local ports; it tests matching histories, lag, divergence by the SAME Ed25519 log signer, certificate rotation without re-pin, wrong CA, wrong signer, invalid URL, missing bearer, restart rollback and outage.
- [x] Linux pytest, native Windows pytest, static security audit and the existing dynamic-preview-operator job run these additional regressions without altering existing real two-tenant Docker admission.
- [ ] The two servers still execute on **one GitHub Actions host**; this does **not** establish separately administered machines, independent log operator identity, externally monitored head distribution, or actual non-equivocation protection.
- [ ] TLS certificate checks are real, but no independent PKI/CA issuance, production certificate lifecycle, hardware signing keys, secure revocation distribution, freshness timestamp/SLA, mTLS, WORM or cross-host storage isolation is proven. The log signer still shares a key in the CI replica simulation.
- [ ] The gossip verifier is an **optional, owner-run trust diagnostic**. It is NOT attached to production manager admission because no actual independent external log trust roots or hosts have been provided; inventing such approval would be unsafe.
- [ ] Never use the disposable reference log to authorize any AI-generated source/Dockerfile, revoke user data, or enable billable AI.

## Bounded acceptance accounting

Prior: **43/49 gates accepted**. After exact-SHA branch, PR and post-merge main CI each pass all 13 jobs, accept one additional gate: **44/50 = 88.0% scoped acceptance**. Until then: **43/50, one gate pending**. This denominator tracks selected trust/reliability checks, **not product feature completion or readiness for production**.

## Remaining Phase 18 P0 blockers

1. Real separately administered two-host HTTPS/mTLS transparency authority with immutable log storage, independently witnessed append-only receipts, independent remote head distribution, cross-host gossip, signer compromise, freshness and revocation/rotation proof.
2. OS-verifiable immutable container build context, read-only staging mounted under independently privileged builder principal, real same-UID and privileged-Docker attacks on Linux rootless and Windows Docker Desktop/WSL2.
3. Independently audited, fully transitive hash locks, offline Python/npm/OCI builds, signed attestations/SBOM, CVE/license and reproducibility proof.
4. Independently hosted authoritative DNS A/AAAA, proxy/DoH/DoT, metadata IPv4/IPv6 and host firewall across Windows/Linux. HTTPS tenant HTTP/WS/SSE and full independent QA with RBAC/cookies/Origin and two-tenant browser proof.
5. Coherent encrypted multi-database WAL corruption and rollback acceptance; real three-floor live telemetry/GPU/mobile/a11y and invoice-based usage ledger.
6. Explicit owner approval of official paid AI provider/model/credentials/price/hard spending cap remains REQUIRED. No paid execution or production deployment.

No force push, live production operation or trust-anchor substitution is authorized.
