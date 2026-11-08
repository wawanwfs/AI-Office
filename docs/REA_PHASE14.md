# WFS AI Office — Phase 14 bounded REA: witness-signed current reviewer epoch checkpoint

Baseline: main `a60c59cd0b0592b99eb1d2a47dca844213a6a870`, 13/13 green.
Inherited accepted gates: **39/45** from Phase 13.
Phase 14 proposes ONE new scoped gate, not the entirety of the
`NEXT_PHASE14_PROMPT.md` deliverables.

## Gate 46 — separately issued, independently pinned reviewer checkpoint

- [x] Reviewer roster requires the existing independently signed roster
  and its pinned SHA-256 (Phase 12), AND a third independently pinned
  Ed25519 witness-signed current epoch checkpoint.
- [x] Exact bounded receipt JSON is domain-separated using
  `WFS-AI-OFFICE:REVIEWER-CHECKPOINT:V1\n`. The receipt binds
  version 1, reviewer policy SHA256, epoch and separate roster-root
  fingerprint. JSON duplicate keys, wrong types, boolean epoch, malformed
  or symlinked evidence and wrong signature domain fail closed.
- [x] The witness key must differ cryptographically from both the reviewer
  signer and the roster-root signer. Operator must independently provide
  witness public-key fingerprint AND latest receipt SHA256.
- [x] `SignedPreviewAuthority` checks the separately signed checkpoint
  on every manager entry, registry mutation and Docker lifecycle operation.
  A manipulated receipt or witness signature denies before Docker.
- [x] Native Linux and Windows regressions include forged/re-pinned
  witness evidence, wrong signature/root, missing pin, runtime tampering.
- [x] An actual SQLite backup is created at epoch 1, policy is
  independently re-signed at epoch 2, local SQLite state is rolled back
  to epoch 1 and a STILL CURRENT externally pinned epoch-2 witness
  rejects a valid old signed roster regardless of restored DB floor.
- [x] The two actual disposable Docker tenant stacks use three distinct
  **synthetic CI-only** signing keys and a correctly bound checkpoint.
- [ ] This is NOT a real online externally hosted transparency service,
  an immutable append-only log, a hardware monotonic counter or proof of
  independent human custody and rotation. A hostile actor who can also
  replay/re-pin old witness receipts and trust anchors may still roll back
  history. A local operator's independently pinned latest witness is
  required to remain current and beyond the attacker’s control.
- [ ] Signed checkpoint adoption must be provisioned by actual trusted
  operators outside the repository; test keys from CI are no substitute.

## Acceptance score qualification

If all **13/13 branch CI, PR CI and exact post-merge main CI jobs pass**,
the new bounded score becomes **40/46 = 87.0%**. Before that evidence,
report **39/46** accepted with one pending. These are hand-selected
acceptance gates, NOT overall product completeness or production
certification.

## Remaining Phase 14 P0 blockers

1. Real organizationally independent external witness service, immutable
   append-only transparency, cross-device signed checkpoints and key
   rotation with durable revocation receipts across offline replicas.
2. OS-immutable source/build staging under different UID and BuildKit
   principal; same-UID/privileged-daemon malicious TOCTOU races.
3. Complete independent Python/JS/OCI transitives and offline reproducible
   image build, signed registry provenance, SBOM and CVE checks.
4. DNS resolver outside the isolated bridge and Internet-facing
   authoritative DNS rebinding, DoH/DoT/IPv4/IPv6/proxy side channels,
   verified host firewall, Windows Docker Desktop/WSL2 and disk limits.
5. QA-approved arbitrary generated code, interactive HTTPS WS/SSE with
   strict Origin, ticket, cookie and tenant RBAC/revocation.
6. Approved real provider/model/cost cap/invoice, encrypted multi-DB
   restore and actual rollback, a11y/GPU/mobile and live 3-floor telemetry.

No paid AI provider, production changes or external public previews.
