# WFS AI Office — Phase 16 bounded REA: compact RFC6962 audit and consistency proofs

**Base:** independently verified green `main` `92818faa4c2c44cdd5c1d375d9282fef737b5924`.
Previously accepted Phase 15: **41/47** scoped reliability and security gates.
This milestone proposes **ONE additional scoped gate**, not full Phase 16 acceptance.

## Gate 48 — independently verify compact inclusion and prior-prefix proofs

- [x] New `backend/preview_compact_merkle.py` independently verifies
  RFC6962 domain-separated, bottom-up **compact inclusion proofs** for
  the CURRENT witness receipt (last leaf) using the signed Phase 15
  tree root. The proof itself cannot determine any trusted root.
- [x] New RFC6962 **compact consistency proof** verification against
  the prior tree size/root pinned independently of the latest
  candidate. Reject forks, stale previous roots, missing/extra
  siblings, invalid/oversized hashes and tree-size downgrades.
- [x] Every manager operation via `SignedTransparencyEvidence.verify`
  requires the compact proof **in addition to** the Phase 15 complete
  leaf-inventory verification, signed current head, four separate
  signer fingerprints, independent policy and witness signature.
  No downgrade path or optional bypass is introduced.
- [x] Operator CLI requires an additional
  `--log-compact-proof` argument; symlinked/unbounded/malformed
  proof inputs fail closed.
- [x] Linux and native Windows regression suites exercise zero,
  equal-size and growing prefixes, odd and power-of-two trees up to
  256 leaves, altered inclusion/consistency siblings, forked
  earlier roots, replayed current receipts, wrong sizes, boolean
  fields, duplicate JSON keys, empty/extra paths and oversized
  payloads. Compact proof verification **does not read the inventory**.
- [x] The reviewed disposable two-tenant Docker operator creates
  and verifies a compact genesis proof with the existing four
  separately generated **synthetic** Ed25519 CI identities.
- [x] Real manager test blocks Docker logs/restart/stop when its
  compact proof is corrupted. A symlink to proof material is denied.
- [ ] This is **not** an independently operated public append-only
  transparency service, remote inclusion query, TLS-pinned head fetch,
  secure gossip/non-equivocation, freshness/staleness monitor,
  cross-host archive, real private-key custody or independently
  distributed signed-head root trust. The current reference still
  independently checks the bounded **full inventory** as well.
- [ ] The reference design remains limited to 256 leaves, disposable
  reviewed template and synthetic-only CI review authorities. No
  general generated code or production Docker authority is granted.

## Narrow acceptance accounting

Previously **41/47 accepted**. If the branch, PR and final merged
`main` GitHub CI each pass **13/13**, accept this ONE additional
scoped gate: **42/48 = 87.5%**. Until final green evidence exists,
report **41/48 accepted + one pending**.

The ratio describes deliberately selected security/reliability
acceptance gates ONLY, **not** percent complete, feature parity,
commercial readiness, independent security certification or
production-readiness.

## Still-blocked Phase 16 P0 work

1. Independently operated external append-only log with compact
   HTTP API, signed receipt issuance and independently protected key
   custody, signed-head gossip/cross-host anti-equivocation, freshness,
   revocation and rotation under tested availability failures.
2. OS-owned immutable staging under separately privileged build UID,
   verified readonly mounts, rootless isolated builder and adversarial
   same-UID/daemon races on Linux AND Windows Docker Desktop/WSL2.
3. Fully hash-locked transitive Node/Python/OCI offline reproducibility,
   independently attested images, trusted CycloneDX SBOM and CVE review.
4. External authoritative DNS outside isolated Docker bridge,
   DoH/DoT/proxy/metadata IPv4+IPv6 and host firewall plus disk quota
   and restricted daemon acceptance on Windows/Linux.
5. Independently QA-reviewed generated source, tenant-scoped HTTPS
   interactive HTTP/WS/SSE, expiring tickets, Origin/cookie/CSP/RBAC
   revocation and real browser isolation.
6. Explicit owner permission and verified billable provider pricing,
   credentials, enforceable caps and real invoice reconciliation.
   Cross-DB encrypted rollback, accessibility/GPU/mobile, live
   three-floor agent telemetry remain unproven.

No force push, production deployment, paid AI execution,
client-controlled Docker files or unreviewed generic source admission.
