# WFS AI Office — Phase 10 continuation

Start from latest GREEN main and audit `docs/REA_PHASE9.md`,
`docs/PHASE9_RUNTIME_RUNBOOK.md`, `docs/REA_PHASE8.md`,
`docs/NEXT_PHASE9_PROMPT.md`, CI artifacts, Docker and gateway sources.
Preserve prior capabilities. No force push or production changes.

P0: Move signed reviewer approval from operator CLI to ALL manager entry
points and trust boundaries. Introduce verified independent authority,
key-rotation/revocation and tamper-evident provenance. Make the build
reproducible: complete Python/JS transitive SBOM, hash-locked offline
wheelhouse, base-image registry-digest attestations and OCI SBOM review.
Test dependency/image substitution and build source TOCTOU under real
disposable Docker.

Run independent authoritative IPv4/IPv6 DNS-rebinding tests against a
controlled resolver, proxy-aware clients, DNS side channels, host egress
firewall enforcement, storage quotas, and fully restricted Docker daemon
permissions; never give Docker socket to gateway. Be precise about CI-only
vs production proof.

Only after isolated QA admits arbitrary source safely, build tenant-bound
TLS interactive HTTP/WS/SSE reverse proxy with strict origin, cookies,
ticket, RBAC and revocation controls. Keep legacy unsafe unscoped routes
denied. Verify real two-tenant browsers, WebSocket upgrade, SSE, writes,
lifecycle and cancellation under failure.

Provider/model credentials, price/cap and real billable AI acceptance
REMAIN BLOCKED without explicit owner approval, actual metering and
independent official invoice validation. No uncontrolled paid execution.
Rehearse Windows/Linux encrypted coherent multi-DB recovery and genuine
create-only restore/rollback on disposable systems, real GPU and mobile
accessibility, true floor-agent telemetry.

Report final full SHA, main green CI URLs, auditable bounded REA gates,
and remaining production blockers. Do NOT claim 100% production-ready.
