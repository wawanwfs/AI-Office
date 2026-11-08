# WFS AI Office — Phase 18 accelerated production-boundary execution

Continue from the latest verified GREEN \`main\`. Audit
\`docs/REA_PHASE17.md\`, \`docs/PHASE17_RUNTIME_RUNBOOK.md\`,
\`docs/NEXT_PHASE17_PROMPT.md\`, complete backend/frontend, CI logs,
test artifacts, Compose, queue, authorization, proxy and recovery.
Preserve all accepted features Phase 1–17. No force push, production
deployment, destructive migrations, owner data loss or paid AI spend
without explicit approval.

**P0 A — Real independent external transparency log.** Phase 17
introduces an authenticated LOCAL reference HTTP log with fsync journal,
signed heads/proofs and two local verifier PROCESSES, not independent
hosts. Move to independently managed test-host/identity and HTTPS/mTLS
with pinned trust, log request authentication and audited durable
append-only/WORM or third-party monitor. Verify real compact RFC6962
inclusion and consistency end-to-end, independently distribute signed
latest checkpoints and verify two HOSTS see one head; run malicious
fork, replay, stale/offline, revocation, compromised signer and
cross-host gossip/non-equivocation alerts. Treat an untrusted signer
and mutable file store as insufficient for production admission.
Separate operational evidence from synthetic CI key identities.

**P0 B — OS-enforced immutable Docker builder.** Separate staging
writer and builder identity, rootless/restricted daemon, OS read-only
bind or immutable sealed content-addressed artifacts, verify actual
mountflags/ownership/privilege, race malicious same-UID/daemon changes
during real BuildKit. Require Windows Docker Desktop/WSL2 and Linux
evidence. No client/AI-submitted Dockerfile before separate QA and
independent reviewer source approval.

**P0 C — Reproducible signed supply chain.** Complete hash-verified
pip/npm/OCI transitives and fully offline wheelhouse, npm and image
build, externally signed CycloneDX/provenance, base image CVE/license
inventory and repeated Windows/Linux evidence.

**P0 D — Real egress and multi-tenant previews.** Controlled external
A/AAAA authority outside isolated Docker bridge, DNS tunnel/DoH/DoT,
metadata IPv4/IPv6/proxy/host firewall/rootless daemon/quota tests.
After reviewed-code gate, deliver scoped expiring HTTPS tenant-bound
HTTP/WebSocket/SSE with strict Origin, CSP/cookies, RBAC revocation,
real two-tenant Chromium browser isolation and denied unscoped routes.

**P0 E — Recovery, cost and Virtual Office.** Coherent encrypted
create-only multi-database WAL backup/restore and real interruption,
corruption/rollback acceptance on Windows/Linux; independent financial
CostLedger/invoice reconciliation, accessible mobile/GPU and actual
three-floor agent telemetry. Paid official model usage remains
BLOCKED until user separately approves official model/provider,
credentials, price schedule and enforceable hard spending cap.

Continue via meaningful, bounded code changes and CI proofs,
not prompt-only planning. For each PR require branch CI, PR CI and
exact post-merge \`main\` 13/13 success and report exact SHA,
narrow acceptance gates, remaining P0 blockers and next prompt.
Never describe any reference/prototype as production independent or
claim 100% overall completion without objective external evidence.
