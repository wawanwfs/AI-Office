# WFS AI Office — Phase 12 bounded REA: independent signed reviewer roster

Baseline: green `main` `7fa68664ab4dbe16d2962f40d99f373b36792e56`.
Inherited Phase 11 accepted **37/43** scoped security/reliability gates.
This milestone proposes ONE narrowly scoped new gate. It is not the
comprehensive Phase 12 acceptance in `NEXT_PHASE12_PROMPT.md`.

## Gate 44 — Offline independently signed roster authority, not SHA-pin alone

- [x] The operator's v1 reviewer roster now requires a **second detached
  Ed25519 signature** over its exact bounded JSON file bytes prefixed by
  `WFS-AI-OFFICE:REVIEWER-ROSTER:V1\n`.
- [x] The roster root public key SHA256 is **independently pinned out of band**.
  A current SHA256 computed by the operator from a modified roster is
  insufficient. A manifest reviewer cannot also be the roster root key.
- [x] `SignedPreviewAuthority` rejects missing root signer, wrong trusted root
  fingerprint, RSA, symlink, bad base64, altered root signature, wrong-domain
  signature and re-signed roster from an untrusted key.
- [x] The extra authority verification occurs on every manager constructor,
  reserve, status, state transition and Docker operation through the same
  Phase 10/11 trust boundary. Phase 11 operator-registry epoch floor and
  snapshot checks are still mandatory.
- [x] Linux and native Windows tests exercise fake policy repinning, signature
  tampering after manager construction, cross-signer rejection, separate-key
  enforcement, synthetic reviewer rotation and old-epoch replay.
- [x] Two real Docker tenant previews continue through CI using **two
  distinct, ephemeral, synthetic signing identities**, not production keys.
- [ ] This proves two cryptographic keys, NOT genuinely independent human
  authorities, offline key custody, certified signer hardware, revocation
  distribution, external transparency or cross-device anti-rollback.
  Trusted root pin and reviewer policies still require separate real-world
  owner provisioning. GitHub CI signer identities are synthetic.

## Acceptance accounting

Prior green 37/43. If PR, branch and final `main` CI are verified
13/13 SUCCESS, add one gate and report **38/44 = 86.4%** of scoped acceptance.
Until then 37/44 with the new gate pending. This score is NOT overall
product completion, production readiness or independent security audit.

## Important remaining Phase 12 blockers

- OS-enforced read-only/immutable build context and isolated builder UID;
  adversarial same-UID racing and daemon escape proof (Phase 11 staging is
  byte-verified but operator-writable).
- Production-grade independently signed and monitored reviewer authority,
  tamper-resistant remote append-only provenance and cross-device epoch floor.
- Complete Python/JS/OCI transitive hash locks, offline build reproducibility,
  signed OCI registry provenance, base-image SBOM and CVE evidence.
- Independent actual authoritative DNS rebinding, IPv4/IPv6/proxy/DNS egress,
  host firewall/rootless restricted daemon, disk quota proofs.
- Generic generated source admission via isolated QA, public tenant-specific
  HTTPS interactive HTTP/WebSocket/SSE with strict ticket/cookie/RBAC controls.
- Explicitly authorized real AI model/price/hard cap and official billing
  reconciliation, cross-platform encrypted coherent restore/rollback,
  GPU, mobile and live agent-floor telemetry evidence.

No production deployment, provider spend, generic untrusted Dockerfile, or
trusted root private key in this repository.
