> **Phase 17 update:** A disposable **loopback-only** authenticated
> reference HTTP log is now available for local signed-head and compact
> proof issuance. It is **not** an independent external authority,
> HTTPS, WORM storage, or a replacement for any Phase 16 trust pin.
> See [Phase 17 runtime runbook](PHASE17_RUNTIME_RUNBOOK.md).

# WFS AI Office — Phase 16 compact Merkle evidence runbook

**Scope:** bounded offline proof verification for the already
independently approved, fixed local React/FastAPI/Postgres Docker
template. Continue to use all four Phase 15 signature identities
(manifest reviewer, signed reviewer roster root, checkpoint witness and
transparency log signer) and their independently provisioned hashes.

## New required proof

The Phase 15 signed tree head, complete leaf digest inventory,
independently pinned current head, and archived prior tree size/root
remain **mandatory**. Phase 16 additionally takes one small JSON
compact proof. Example for an approved one-leaf genesis head:

```json
{
  "version": 1,
  "tree_size": 1,
  "leaf_index": 0,
  "receipt_sha256": "<SHA256 of the exact current witness receipt JSON bytes>",
  "inclusion": [],
  "previous_size": 0,
  "consistency": []
}
```

For multiple leaves, `inclusion` is the bottom-up RFC6962 audit path
for the **last** witness receipt. `consistency` is the RFC6962
SUBPROOF path binding the independently approved old tree size and root
to the CURRENT separately signed tree head. Hashes are lowercase
64-character SHA256 hex. Prove the old root from a separately protected,
previously trusted archive; **never** take it from the same untrusted
proof JSON or calculate it from an unapproved inventory.

The standalone `verify_compact_proof` does not require the full leaf
inventory; the Phase 16 preview operator currently **also** verifies
Phase 15 full inventory for defense in depth. The CI-only fixture
generators `make_inclusion_path`/`make_consistency_path` are NOT an
authorization authority and MUST NOT be used to self-approve
user-supplied source.

## Windows 10/11 CLI

Append to the complete, independently verified Phase 15 operator
arguments, including the independent witness/head/root pins:

```powershell
$approval += @(
  "--log-compact-proof", "C:\WFS-Private\compact-current-proof.json"
)
python scripts/wfs_operator_preview.py status --approved --state-root "C:\WFS-Private\preview" --project demo-alpha @approval
```

A missing compact file, invalid proof, substituted path/symlink, altered
leaf, replayed checkpoint, or wrong prior root MUST fail closed before
registry mutation and before Docker operation. Running actual preview
start/restart/stop still requires explicit local approval, disposable
host, independent reviewed source and an operator-controlled token.

## CI verification and limitations

The default GitHub Actions Linux Python suite and Windows-native Python
gate exercise audit and consistency proofs, negative cases and
manager lifecycle denial. The existing real two-tenant Docker CI
builds use only an approved fixed template and FOUR **synthetic test
signers** (not production review) with compact genesis proof.

The implementation has no independently operated external
transparency service, trusted HTTPS distribution, cross-device gossip,
large-scale compact consistency API, live freshness policy or protected
hardware roots. A real external authority and independent operator
verification are required before production trust is possible.
No paid AI provider, production deployment or arbitrary generated
Dockerfile is authorized by this runbook.
