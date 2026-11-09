# WFS AI Office — Phase 17 bounded REA: authenticated reference transparency HTTP log

**Baseline:** Phase 16 green main \`50ef34723f4f4045428bc10d49cc4fa10fa08345\`.
Previously accepted: **42/48** scoped gates. This PR proposes **one additional gate**, NOT the entire Phase 17 production boundary.

## Gate 49 — real local HTTP append, persistence and cross-process signed proof verification

- [x] A real HTTP service binds **127.0.0.1 only**. Every read and write
  requires a constant-time-checked, ASCII bearer token of at least 32 chars;
  no public port, Docker socket, production endpoint or generated source.
- [x] \`POST /v1/append\` strictly accepts a witness-receipt SHA256,
  expected current tree size and expected current Merkle root as
  compare-and-swap constraints. Rejects stale writes, duplicates,
  invalid JSON, unauthorized calls and tree overflows (256 leaves).
  This service does NOT authorize or sign witness receipts themselves.
- [x] The append-only *by convention* local JSONL journal stores sequential
  index, receipt digest and cumulative RFC6962 root, using O_APPEND,
  flush and fsync **before** signing the next head. On restart and
  before new signatures, validate every record and compare disk to
  memory; deny malformed, truncated, replaced and inconsistent history.
- [x] Authenticated HTTP \`GET /v1/head\`, \`GET /v1/inventory\`, and
  \`GET /v1/proof?previous_size=N\` yield actual domain-separated
  Ed25519-signed heads and RFC6962 inclusion and prefix-consistency
  proofs directly from the persisted journal.
- [x] Two separate real Python interpreter verifier **processes**
  concurrently fetch a signed head, authenticate the independently
  pinned public-key fingerprint and head SHA256, and verify compact
  inclusion plus independently archived previous Merkle root.
  A separately signed alternate fork and replayed old head are denied.
- [x] Integration with the existing Phase 15/16 SignedTransparencyEvidence
  verifier is exercised without weakening its signed-header, complete
  inventory and compact-proof requirements.
- [x] Linux/Windows-native tests cover HTTP/auth, restart, journal tamper
  while serving, stale compare-and-swap, digest replay, fork, outage,
  malformed payload, symlink, and POSIX signer-key mode enforcement.
  Existing 13 CI gates including real two-tenant Docker remain mandatory.
- [ ] The two verifier *processes*, signer and reference server are on
  **one CI host**, NOT two independently administered hosts.
  Loopback HTTP is NOT TLS, an independently witnessed transport or
  externally operated transparency service.
- [ ] JSONL plus fsync is NOT immutable WORM, secure append-only media,
  an HSM, cross-host gossip, a protected latest-head distribution,
  verified key custody, or global non-equivocation. A malicious same-UID
  actor can still race disk operations, and a compromised log key can
  sign competing histories. Restoring every independent trust pin can
  still permit replay. No production use is approved.

## Narrow acceptance score

Before branch + PR + exact post-merge main 13/13 CI success:
**42/49 accepted, one gate pending**. After independently verified
green CI on those three commits: **43/49 = 87.8% scoped acceptance**.
This is NOT overall feature completion or production readiness.

## Remaining Phase 17 P0 blockers

1. Independently hosted external transparency with HTTPS/pinned identity,
   physical WORM or external append-only monitoring, cross-host
   non-equivocation gossip, freshness, revocation, key rotation and
   independent organizational custody.
2. True OS-immutable stage and privileged builder-UID separation with
   adversarial same-UID and Docker daemon races on rootless Linux and
   Windows Docker Desktop/WSL2.
3. Independently hash-locked offline Python/npm/OCI reproducibility and
   signed SBOM/provenance/CVE/license evidence.
4. Real external DNS/DoH/DoT and metadata IPv4/IPv6 host firewall;
   tenant HTTPS HTTP/WS/SSE with tickets, cookies/CSP, RBAC revocation
   and two-tenant browser proof after independent source QA.
5. Coherent encrypted multi-DB WAL corruption and rollback on Windows
   and Linux, three-floor live telemetry/GPU/mobile/a11y evidence.
6. Official paid AI model and invoice reconciliation BLOCKED pending
   explicit owner approval of provider/model/credentials/prices/hard cap.

No force push, public deployment, unreviewed Dockerfiles, paid AI,
trusted private keys in GitHub, or production modification.
