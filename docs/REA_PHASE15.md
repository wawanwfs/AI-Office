# WFS AI Office — Phase 15 bounded REA: independently pinned signed Merkle verification

**Baseline:** main `5c57646ae1bde4d509979f266d3895bac1440c25`, verified 13/13 green.
Previously accepted **40/46** narrowly chosen reliability and security gates.
**This phase proposes ONE incremental gate, not full Phase 15 readiness.**

## Gate 47 — signed tree-head receipt inclusion + trusted-prefix consistency

- [x] Independent fourth Ed25519 public-key fingerprint is pinned out-of-band
  for the *log signer*, distinct from manifest reviewer, roster root and
  signed checkpoint witness. No private signing key is part of operator or
  user-uploaded content.
- [x] Separately supplied current signed tree-head JSON (v1, tree_size,
  root_sha256) must match an **independently supplied latest SHA256 head pin**,
  detached domain-separated Ed25519 signature, and exact bounded schema.
- [x] RFC6962-style domain-separated SHA256 Merkle tree:
  `SHA256(0x00 || 32-byte receipt digest)` for leaves,
  `SHA256(0x01 || left || right)` for internal nodes,
  greatest power-of-two split, empty tree root SHA256(empty).
- [x] Verify COMPLETE bounded ordered leaf digest inventory against signed
  tree root. Current Phase 14 witness receipt SHA256 must be the **last**
  leaf. Duplicate/altered/reordered or forged inventory is rejected.
  Max 256 leaves / 20 kB proof for a bounded reference implementation.
- [x] Verify prefix consistency by recomputing an older tree size/root that
  must be pinned outside the untrusted log. This is a **full-leaf prefix
  proof**, NOT a compact RFC6962 audit/consistency proof from a service.
- [x] Phase 15 log verification is mandatory on every manager entry via the
  Phase 14 witness check, including Docker lifecycle and operator CLI.
  New CLI arguments require current head + signature + full leaf inventory
  + separately trusted key, head digest, earlier tree size and root.
- [x] Native Linux and Windows negative tests for signed head tampering,
  stale receipt inclusion, prefix forks, signer substitution, invalid
  head JSON, duplicate leaves, malformed signatures, symlinks and replay.
- [x] Regressions restore the actual SQLite registry from an older backup,
  attempt to replay a valid older signed witness against the **latest**
  independently pinned log head, and require denial before Docker calls.
- [x] Two real Docker template preview tenants in CI use FOUR different
  ephemeral **synthetic test-only** Ed25519 signing identities.
- [ ] Does **not** operate or connect to an actual externally managed log.
  There is no externally verifiable public URL, inclusion gossip,
  monitoring, non-equivocation proof, timestamp freshness, key custody,
  append-only enforcement or independently protected latest-head delivery.
- [ ] Replacing *all* externally provisioned trust anchors (old policy,
  signed witness receipt, log head and older root) can still replay history.
  A previously pinned non-empty root detects incompatible forks but a
  fresh unanchored zero-length tree cannot independently detect log forks.
- [ ] Bound of 256 receipts makes this a demonstration verifier, not a
  production-scale transparency deployment or independent security audit.

## Narrow progress accounting

Prior: **40/46 accepted**. After separate branch, PR and exact merged
main CI all succeed with 13/13 jobs, this scoped gate yields **41/47 =
87.2%**. Before final acceptance, report **40/47 + 1 pending**.
This is NOT overall feature completeness, deployment readiness, or proof
of full Phase 15 success.

## Important unfinished Phase 15 P0 tasks

1. Real external append-only transparency service, signed inclusion and
   compact consistency proofs, cross-host gossip/non-equivocation, real
   human root custody, secure epoch/head pin distribution and freshness.
2. OS-enforced builder-UID separation and immutable staged source
   filesystem, malicious same-UID/daemon racing under Windows/Linux.
3. Complete offline Python/JS/OCI hash-locked reproducible builds,
   independently signed provenance/SBOM and vulnerability audit.
4. External authoritative A/AAAA DNS/DoH/DoT/proxy firewall and metadata
   egress, host-level isolation, Windows Docker Desktop/WSL2, rootless
   daemon and disk quota evidence.
5. QA-approved generated source with tenant HTTPS HTTP/WebSocket/SSE,
   scoped tickets, strict Origin/cookies/RBAC/revocation, real browsers.
6. Owner-approved billable provider/model/cost caps with real invoice
   reconciliation, encrypted coherent multi-DB restore and rollback,
   accessibility/GPU/mobile and live three-floor office telemetry.

No production execution, no unreviewed generated Dockerfile, no paid AI
provider, no force push, no public preview and no authority credential
placed in source control.
