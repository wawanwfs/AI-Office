# WFS AI Office — Phase 13 bounded REA: actual Docker UDP DNS rebinding

Baseline: green main 1c7572e25527f2784c3b215a17bb236a63d7a78c.
Inherited Phase 12 accepted **38/44** narrowly defined security gates.
This phase proposes ONE new scoped acceptance gate, NOT the full Phase 13.

## Gate 45 — Real controlled UDP DNS A/AAAA rebinding on internal Docker

- [x] Dedicated non-root, read-only, no-new-privileges, no-capabilities,
  memory/PID-constrained DNS sidecar on the actual running tenant's
  **internal-only** Docker network using digest-pinned Python image.
- [x] Fixed reviewed tenant API resolves the sidecar through Docker DNS
  and sends **real UDP DNS requests**; unlike Phase 9 this new proof
  does not monkeypatch getaddrinfo or substitute fake DNS answers.
- [x] Validate DNS transaction ID, peer address, AA authoritative flag,
  exact question/type/class, answer length and TTL=0.
- [x] Change A response from 169.254.169.254 (metadata) to 1.1.1.1
  (public), AAAA from 2001:4860:4860::8888 to 2606:4700:4700::1111.
  Confirm all four responses and failed actual outbound TCP attempts.
- [x] Run proof for both disposable isolated Docker tenant networks;
  clean up DNS sidecar after success or failure.
- [x] Verify no API Docker socket or ambient proxy environment;
  retain existing direct IPv4/IPv6/metadata egress tests.
- [ ] This is a **controlled internal Docker experiment**, not a real
  external public authoritative DNS server, OS-level Windows Docker
  Desktop/WSL2 host firewall audit, rootless daemon proof, DoH/DoT
  block test or comprehensive SSRF/privileged escape certification.

## Narrow scoped score

Previous 38/44 accepted. If branch, PR and merged main CI 13/13 all
pass, ONE new gate yields **39/45 = 86.7% scoped acceptance**.
Before final green main CI: **38/45 accepted + 1 pending**.
This is NOT overall feature completeness or production readiness.

## Unfinished Phase 13 blockers

1. Independent real-world signer identity/private key custody, remote
   append-only transparency, cross-device epoch anti-rollback.
2. OS-enforced immutable separately owned build staging, hostile same
   UID/daemon racing, complete offline npm/Python/OCI signed provenance.
3. External authoritative rebind, proxy/DoH/DoT/IPv4/IPv6 host firewall,
   rootless/restricted Docker daemon and disk limits on Windows/Linux.
4. QA-reviewed generated code, interactive tenant HTTPS/WS/SSE,
   Origin/cookie/RBAC revocation and browser isolation.
5. Explicit owner-approved paid AI provider/model/budget with official
   invoice reconciliation; coherent encrypted recovery rollback,
   GPU/mobile/a11y and live office telemetry.

No provider spend, production deployment, public preview or arbitrary
user-provided Dockerfile. CI signing keys remain synthetic.
