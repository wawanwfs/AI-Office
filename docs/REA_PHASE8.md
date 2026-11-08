# WFS AI Office — Phase 8 bounded REA: reviewed preview supply chain

Baseline main at start: `a2b3975fbd63a08eb3c24c7c25b05bece3921bac`.
Previous Phase 7 evidence: **30/36 narrow gates**, conditional on green CI.
This document records a SINGLE new security gate, not completion of Phase 8.

## Gate 37 — Versioned operator supply-chain admission (conditional)

- [ ] CI `pytest`, native Windows, Docker two-tenant operator and browser
      E2E green on the final merged commit.
- [x] Operator-supplied **version 2** manifest (exact schema) required for
      EVERY template lifecycle Docker operation; old four-source-only manifest
      is rejected.
- [x] Compare SHA-256 of ALL reviewed Docker Compose/API/ingress source files,
      exact built frontend file inventory (including new files), dependency
      lockfile and a checked CycloneDX JSON SBOM.
- [x] Reject symlinked/missing/out-of-bounds files, extra or removed frontend
      assets, unexpected Docker image references and Docker image tags without
      immutable SHA-256 references. The PostgreSQL reference is now pinned.
- [x] Regression tests for frontend mutation, extra asset, symlink, lock/SBOM
      mutation, malformed SBOM, unversioned and mutable-image manifest.
- [ ] Independent signed attestations, SBOM completeness for transitive
      Python wheels, offline PyPI hash-locked build, real DNS/IPv6 egress
      firewall and authoritative Docker image provenance remain OUT OF SCOPE.

**Provisional narrow total: 30/37 until the final CI run is GREEN;
31/37 = 83.8% only if gate 37 is fully accepted.**
No claim of 83.8% overall engineering completion, security certification
or production readiness follows from that metric.

## Still blocked / not claimed

1. Official model and strict spend cap approval; real paid-provider call.
2. Independently verified invoice-based metering across ALL billable paths.
3. Generic QA-gated user-generated fullstack admission, public interactive
   HTTP/SSE/WS TLS reverse proxy and complete tenant-origin restrictions.
4. Production daemon hardening and rootless/restricted Docker separation;
   independent DNS, SSRF, IPv6 and storage quota tests.
5. Coherent encrypted multi-DB Windows/Linux recovery and actual rollback.
6. Real-device GPU, mobile accessibility and live three-floor telemetry proof.

CI checkout is trusted solely for disposable CI tests. A locally generated
candidate manifest must NEVER be interpreted as operator authorization.
No production service was modified; no official provider money spent.
