# WFS AI Office — Phase 21 bounded REA: sealed ingress image, no ingress host bind

**Exact baseline:** Phase 20 green `main` commit `4abcd926d9ea5d38c4275b6912f93751c6fc3e83`, verified 13/13 GitHub Actions jobs in run [43330459584](https://github.com/wawanwfs/AI-Office/actions/runs/43330459584). Previously accepted **46/52** narrowly scoped gates.

## Proposed Gate 53 — ingress.py is not host-bound in the real operator lifecycle

- [x] Reuse signed reviewer, separately pinned witness/roster, transparency and checked snapshot. Only the exact SHA256-reviewed `ingress.py` from an opened regular-file descriptor is eligible for a build.
- [x] Generate an operator-owned **fixed** ingress Dockerfile in memory with the previously approved Python 3.11 Alpine base digest. Neither client/agent input nor a mutable host Dockerfile is accepted.
- [x] Build an ingress context from those bytes, seal the entire tar with mandatory Linux kernel memfd seals, then BuildKit consumes only sealed stdin. Windows fails closed.
- [x] Inspect and pin the exact local engine image ID for ingress alongside the prebuilt API. Persist the ingress ID in the manager's SQLite registry and verify both local IDs before every sealed lifecycle command.
- [x] Deterministically derive reviewed Compose: remove the ingress `./ingress.py:/app/ingress.py:ro` host bind, replace ingress base reference with its prebuilt **local image ID**, and set `pull_policy: never`. Reject changed signed Compose bytes or malformed pins; keep `--no-build --pull never`.
- [x] Extend regression tests for malformed/substituted IDs, reviewed-source mutation, sealed tar immutability and Windows denial.
- [x] Extend actual two-tenant Docker CI to inspect ingress containers' exact image IDs and mounts, modify both live checkout and staging `ingress.py` while serving authenticated HTTP, and require successful service after mutation. Mutations are restored before subsequent signed-admission tests.

## Not certified

- [ ] **Frontend dist remains host-bound** to the running API, even with `:ro` on the container side. A malicious same-UID actor can still tamper with source assets. Next required gate: seal/hash and bake signed frontend assets into the immutable API runtime image.
- [ ] Local Docker image IDs are **not** independently signed OCI registry manifest digests or off-host approvals. No proof against privileged Docker daemon, rootful operator, same-UID SQLite/host state edits, or compromised kernel.
- [ ] No true rootless separate-builder UID/OS authority, verified Windows Docker Desktop/WSL2, fully offline transitive supply chain, independent external log WORM, host firewall, public TLS preview, multi-DB encrypted recovery or approved paid AI execution.
- [ ] CI uses ephemeral synthetic signing keys. These are not evidence of production custody, owner-signed trust roots, or production authorization.

## Accounting

The previous denominator was **52** with **46 accepted**. This PR proposes **one** new gate. Until its exact-SHA branch, PR and merged `main` runs each prove all 13 CI jobs green, report **46/53** with one pending. Only on that proof accept **47/53 = 88.7%** of deliberately selected gates, *not* product completion or production readiness.

No force push, paid provider access, private signing root reset or production deployment.
