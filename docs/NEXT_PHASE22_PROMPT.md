# WFS AI Office — Phase 22 accelerated execution prompt

Start from the exact latest **green** `main`. Audit docs/REA_PHASE21.md, docs/PHASE21_RUNTIME_RUNBOOK.md, backend/preview_sealed_runtime.py, backend/preview_sealed_build.py, backend/preview_manager.py, signed Compose, and all GitHub Actions artifacts. Do not force push, auto-deploy, reset signing roots, or activate paid AI.

**P0 A — CLOSE FINAL FRONTEND HOST BIND:** Phase21 removes the running ingress host mount, but `../../artifacts/fullstack-preview/dist:/app/dist:ro` still permits same-UID host changes. Rebuild only the fixed reviewed API image with all signed/hash-reviewed frontend dist assets packed into a kernel-sealed BuildKit context; deterministically remove the frontend bind in real operator Compose. Inspect actual running two-tenant mounts and serve live HTTP while staged + source dist are actively mutated. Independently pin the image and prove immutable contents without trusting the malicious host or daemon. Keep special handling for Windows Docker Desktop/WSL2; no writable fallback.

**P0 B — SEPARATE ROOTLESS AUTHORITY AND OCI:** Make writer/builder/gateway distinct OS users with restricted rootless Docker (plus adversarial daemon race tests), signed OCI manifest digest provenance and independent witness roots, immutable off-host approvals, no same-UID local SQLite trust. Do not equate engine image config IDs with registry manifests.

**P0 C — OFFLINE TRANSITIVE SUPPLY CHAIN:** Verify all transitive Python/npm/OCI package hashes, offline caches, deterministic builds, independent CycloneDX SBOM, CVE/license and provenance with substitution/rollback detection.

**P0 D — REAL EXTERNAL LOG & NETWORK:** Genuinely independent host administrators, mTLS/WORM with signed head freshness/revocation and recovery; outside-Docker authoritative A/AAAA/DoH/DoT and rootless Linux+Windows host firewall/quotas, metadata IPv4/IPv6 denial.

**P0 E — TENANT PREVIEWS, RECOVERY, LIVE OFFICE:** Independent source QA before public tenant HTTPS/WS/SSE, short lived RBAC tickets/Origin/CSP/cookies/revocation with two-tenant Chromium. Coherent encrypted WAL multi-database restore on Windows/Linux and real telemetry/accessibility, invoice CostLedger reconciliation.

Billable AI provider/model/credential/price/spending caps remain **BLOCKED until explicit owner authorization**. Implement at least one bounded meaningful code gate, test all 13 CI jobs for PR branch, PR and merged main, and report the exact SHAs, limitations, narrow numerator/denominator and a new executable next prompt. Never imply production security or full product completion from synthetic CI.
