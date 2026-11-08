# WFS AI Office — Phase 17 accelerated production-boundary execution

**Repository:** https://github.com/wawanwfs/AI-Office
**Base branch:** latest independently verified green `main`.
Begin by auditing docs/REA_PHASE16.md, docs/PHASE16_RUNTIME_RUNBOOK.md,
docs/NEXT_PHASE16_PROMPT.md, complete backend and frontend, CI
workflows/logs/artifacts, Docker Compose, worker identity and recovery.
Preserve ALL green features from Phases 1–16. Never force push,
overwrite trusted pins, erase user data, deploy to production or incur
paid AI costs without separately explicit owner authorization.

**P0 A — Actual external transparency (beyond compact proofs).**
Deploy a disposable, separately operated reference log service on an
independent test host/identity (NOT the preview Docker daemon).
Append witness receipts via an authenticated and audited API, require
proof of physical append-only storage or detect/treat it as an
untrusted signer, implement a real RFC6962 compact inclusion and
consistency endpoint, signed latest tree-head rotation, independently
distributed and pinned checkpoints, secure HTTPS transport, outage
timeouts/retry ceilings, bounded staleness, cross-host gossip and
fork/equivocation alarms. Prove two different verifier hosts observe
the same head; test malicious forks, replay of earlier receipts and
head, compromised old signer, late revocation and offline recovery.
Do not claim independent organizational authorization merely because
CI generates several different keys.

**P0 B — Real OS-immutable Docker source boundary.**
Replace operator-writable staged context with OS-verified readonly
artifact mount and separately privileged builder principal, no Docker
socket at gateway and no same-UID write access to builders. Run REAL
adversarial same-UID and daemon-capability races on restricted rootless
Linux Docker and Windows 10/11 Docker Desktop/WSL2; block build if
source hashes change, audit identity, mountflags, ownership, snapshot,
container capabilities and root filesystem. Verify canonical trusted
digest from artifact to container. Never admit generic AI-generated
Dockerfiles before isolated QA and independent reviewer approval.

**P0 C — Complete signed offline supply chain.**
Hash-pin all transitives in Python, npm lock and Docker base layers.
Produce reproducible offline wheelhouse/npm cache and OCI image, signed
external provenance and CycloneDX SBOM, base-image CVE/license checks
with documented false positives and Windows/Linux comparison.

**P0 D — Full egress and public-preview isolation.**
Test a real authoritative DNS resolver OUTSIDE the isolated bridge
with controlled A/AAAA rebound, metadata IPv4/IPv6, DNS tunneling,
DoH/DoT/proxy and host IPv4/IPv6 firewall on rootless Linux AND
Windows Docker Desktop/WSL2; evidence for disk quotas, outbound
deny-by-default, prohibited Docker socket and loopback-only exposure.
Only after independent generated-source QA, build HTTPS tenant-bound
HTTP/WS/SSE preview with scoped expiring tickets, strict Origin,
cookie/CSP protections, RBAC revocation and actual two-tenant browser
tests. Preserve old read-only proxy and deny unscoped legacy routes.

**P0 E — Recovery, metering and Virtual AI Office.**
Test encrypted coherent multi-DB WAL recovery and rollback after
intentional simulated corruption and interruption, using Windows
native and Linux. Keep official billable model execution BLOCKED
until explicit provider/model/key/price/hard cap authorization plus
actual usage/invoice reconciliation. Prove accessible mobile/GPU
telemetry for the three-floor virtual office using real backend
events, not simulated work.

**Delivery discipline:** Work in secure bounded increments, continue
through failures rather than stopping at planning. For every commit,
run targeted tests, Linux/Windows CI, real disposable Docker and
two-tenant browser acceptance when relevant. Only merge via reviewed
PR when all required jobs are green. Report exact branch, PR, full
post-merge `main` SHA, precise scope and remaining blockers, and
next ready-to-run execution prompt. Scoped gate % is not an overall
readiness claim; never claim 100% without independently observed
production controls.
