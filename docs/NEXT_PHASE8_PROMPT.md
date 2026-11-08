# WFS AI Office — Phase 8: Real Provider, Generic Preview & Production Boundary

Repository: https://github.com/wawanwfs/AI-Office
Branch: main

Audit latest HEAD, Actions, docs/REA_PHASE7.md,
docs/PHASE7_RUNTIME_RUNBOOK.md, docs/REA_PHASE6.md, and source.
Preserve Phase 1–7 features, no force push, no destructive changes.

## P0 priorities

1. Get explicit approved official provider/model and strict spend cap
   BEFORE real AI requests. Run a genuine end-to-end AI code-generation
   acceptance only after authorization. Without it keep BLOCKED.
2. Meter all chat, SSE streams, agents/subagents, summarization, retries,
   QA and provider calls with request IDs, actual provider usage, approved
   pricing, budget reservation and authentic independently verified invoices.
   Manual digest entries alone are insufficient to reconcile funds.
3. Build generic versioned, QA-gated source admission for React/Vite,
   FastAPI/PostgreSQL and approved other stacks; deny arbitrary Dockerfile,
   unapproved dependency, image, mount, privileged operation and egress.
4. Extend current RBAC read-only preview inspection to secure interactive
   HTTP/WS/SSE reverse proxy, logs and lifecycle with TLS, tenant-bound
   origin, secrets not forwarded from browser, and verified artifacts.
5. Separate production Docker worker/daemon permissions. Use rootless
   or restricted daemon proxy, pin ALL images including database, SBOM
   and supply-chain review, disk quota, DNS/SSRF/IPv6 egress firewall,
   crash reconciliation, cancellation and idempotent cleanup.
6. Migrate closed legacy endpoints into compatible per-project authenticated
   APIs while keeping all legacy unscoped routes denied by default.
7. Rehearse full cleanroom Windows 10/11 Docker Desktop/WSL2 and Linux
   setup, encrypted coherent multi-DB backup, create-only restore and
   VERIFIED actual rollback on disposable systems, not production.
8. Wire 13 SaaS menus and three-floor 3D workspace to genuine telemetry,
   preserve ambient simulation provenance; profile GPU, keyboard,
   reduced-motion and mobile accessibility on real devices.

Gate all via backend/frontend tests, Vite build, real Docker and cross-tenant
browser E2E, SAST/SCA, history-aware secret scanning, billing, Windows/Linux
recovery evidence and rollback. Upload source/screenshot/evidence artifacts.
Push verified commits to main via wawanwfs without force. Report final
full SHA, green CI URLs, bounded REA numerator/denominator and blockers.
NEVER claim 100% production-ready while P0 remains.


## Follow-up after Phase 7 continuation

Preserve the new local crash receipt repair and four-file SHA256 admission.
Phase 8 must make the preview admission supply-chain complete: frontend
assets, all base images including PostgreSQL, SBOM and dependency lock
must be verified, ideally with signed manifests. Test DNS rebinding and
network egress independently. Preserve the strict worker HTTP origin
policy; keep all paid provider acceptance blocked until authorization.
