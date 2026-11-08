# WFS AI Office — Phase 12 continued production-boundary acceptance

Start from latest GREEN `main` and audit `docs/REA_PHASE11.md`,
`docs/PHASE11_RUNTIME_RUNBOOK.md`, `docs/REA_PHASE10.md`,
`docs/NEXT_PHASE11_PROMPT.md`, GitHub Actions logs and actual
Compose, gate, preview proxy, identity and recovery source. Preserve
accepted code and features. No force push or production changes.

**P0:** Replace the local SQLite-only reviewer epoch floor with an
independently signed reviewer-roster authority, durable monotonic
anti-rollback/append-only provenance, separately protected trust root,
revocation and cross-device rotation. Do not trust policy digests
calculated by AI or the candidate build.

**P0:** Upgrade currently privately staged reviewed build inputs to
OS-enforced read-only immutable staging / isolated builder principal.
Run adversarial SAME-UID and daemon-capability races while Docker
builds. Verify only sealed, reproducible artifacts are mounted. Add
complete audited JS/Python transitive SHA-locked dependencies, offline
wheelhouse/node installs, image-registry signed OCI attestation, base
image SBOM/CVE review. Do not accept generic generated Dockerfiles
before the isolated QA/security gate.

**P0:** Independently prove host-level egress policy with controlled
authoritative DNS rebinding, metadata/IPv4/IPv6/DNS/proxy-aware clients,
disk quotas and restricted rootless Docker/daemon permissions.
Do not give the HTTP gateway access to the Docker socket.

After source QA safety is proven, implement tenant-specific authenticated
interactive HTTPS HTTP/WebSocket/SSE reverse proxy, strict Origin,
ticket/cookie/RBAC revocation and real two-tenant browser tests while
preserving existing read-only proxy and legacy unscoped-deny routes.
No arbitrary URLs or SSRF.

Paid AI remains BLOCKED until owner explicitly authorizes official
provider/model, credential provisioning, price schedule and hard spend
cap; invoice reconciliation must use actual provider records, never
fabricated tokens. Complete Windows Docker Desktop/WSL2 and Linux
disposable cleanroom encrypted multi-DB restore and actual rollback,
GPU/mobile/accessibility and live three-floor telemetry acceptance.

Report exact merged commit SHA, green post-merge CI evidence,
bounded numerator/denominator, known gaps and next prompt. Never
claim 100% production readiness without independent verification.
