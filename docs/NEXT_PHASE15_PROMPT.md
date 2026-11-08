# WFS AI Office — Phase 15 next execution prompt (production-boundary continuation)

Begin from the latest verified GREEN `main`. Audit
`docs/REA_PHASE14.md`, `docs/PHASE14_RUNTIME_RUNBOOK.md`,
`docs/REA_PHASE13.md`, `docs/NEXT_PHASE14_PROMPT.md`, all live
code paths, complete GitHub Actions logs and artifacts. Preserve
the accepted Phase 1–14 features. Do not force push or change production.

**P0 reviewer trust:** Phase 14 requires independently pinned offline
witness-signed current-epoch receipt; close its limitation with a real
externally operated append-only transparency log, verified inclusion
and consistency proofs, trusted protected/latest checkpoint, cross-host
anti-rollback, delayed-revocation tests, root and witness rotation,
staleness policy and operator key custody evidence. Run restore/replay
tests with independently protected counters, not only CI-generated keys.

**P0 build integrity:** Enforce OS-owned, read-only sealed staging
under separate builder UID, no same-UID write and no privileged daemon
access, with adversarial real Docker/BuildKit races and filesystem
immutability evidence on Windows/Linux. Full independently audited
transitive Python/JS/OCI hash locks, reproducible offline builds,
signed OCI SBOM/attestation and CVE scanning. No arbitrary AI-generated
Dockerfile/source before explicit isolated QA.

**P0 network security:** Build a controlled independently hosted
authoritative A/AAAA rebind resolver outside the isolated Docker
bridge and prove blocked egress paths including DoH, DoT,
IPv4/IPv6, proxy, cloud metadata and host firewall. Show
Windows Docker Desktop/WSL2 and restricted/rootless Linux daemon
and disk quota evidence. Never give the public gateway the Docker
socket or client-controlled upstream targets.

Only after independent QA, implement real authenticated multi-tenant
HTTPS interactive HTTP/WebSocket/SSE with scoped expiring tickets,
origin/cookie controls, RBAC revocation, two-tenant browser evidence,
and deny old unscoped routes. Continue coherent encrypted multi-DB
restore/rollback, GPU/a11y/mobile and three-floor live telemetry.

Billable AI stays BLOCKED until explicit user-approved official provider,
model, credential provisioning, price schedule, enforceable hard spending
cap and reconciliation to real provider invoice data.
Report exact commit SHA, PR, post-merge 13/13 green CI, narrow scope
numerator/denominator and remaining gaps. Never claim 100% or production
readiness without real independent verification.
