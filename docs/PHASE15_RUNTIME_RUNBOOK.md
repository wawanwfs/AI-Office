# Phase 15 — signed Merkle receipt history verifier (bounded operator use)

**Do not treat this as a deployed transparency log.** It is an offline,
strict, full-leaf verification gate for the fixed reviewed disposable
preview template. Start with the existing
[Phase 14 witness runbook](PHASE14_RUNTIME_RUNBOOK.md).

## The fourth trusted signer

Besides independently authorized manifest reviewer, roster root and
witness, a separately operated **log signer** must sign the current
head over the exact JSON bytes with the domain separator
`WFS-AI-OFFICE:TRANSPARENCY-TREE-HEAD:V1\n`.
Its Ed25519 private key never enters GitHub, the preview operator, LLM
tooling, or Docker. The root's public key SHA256 fingerprint and the
latest signed head file SHA256 are verified **out of band** and pinned.
GitHub CI creates synthetic temporary signers; it does not provision an
independent organizational authority.

A signed head has exactly three fields:

```json
{
  "version": 1,
  "tree_size": 1,
  "root_sha256": "<64 lowercase SHA256 hex>"
}
```

The leaf inventory has exactly two fields:

```json
{
  "version": 1,
  "receipt_digests": ["<SHA256 of exact current witness receipt JSON bytes>"]
}
```

To construct the tree for a REAL externally authorized history, use
RFC6962-style leaf `SHA256(0x00 || receipt_digest_bytes)`, internal
`SHA256(0x01 || left_root || right_root)`, power-of-two split and
empty tree root `SHA256(b'')`. The current witness receipt MUST be the
last signed leaf. The complete inventory is currently capped at 256
receipts for bounded reference proof size.

An archived trusted older head's **tree size** and **root_sha256**
must be independently verified, pinned and passed, not calculated from
an untrusted new inventory. During genesis only, set size 0 and
root SHA256 of empty bytes:
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## New mandatory CLI options (Windows PowerShell)

Add these options to the COMPLETE Phase 14 approved operator argument
array (`$approval`, which includes all prior signatures and pins):

```powershell
$approval += @(
  "--log-public-key", "C:\WFS-Private\log-public.pem",
  "--log-head", "C:\WFS-Private\latest-log-head.json",
  "--log-head-signature", "C:\WFS-Private\latest-log-head.sig",
  "--log-leaf-inventory", "C:\WFS-Private\complete-log-leaves.json",
  "--trusted-log-head-sha256", "<latest head SHA256 independently approved>",
  "--trusted-log-fingerprint", "<log public raw Ed25519 key fingerprint>",
  "--trusted-previous-tree-size", "0",
  "--trusted-previous-tree-root", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
)
python scripts/wfs_operator_preview.py status --approved --state-root "C:\WFS-Private\preview" --project demo-alpha @approval
```

A full non-genesis history requires a separately archived, previously
verified tree size/root. A new head must preserve that prefix. The
verifier accepts no self-computed pins. Wrong signing identity, malformed
data, altered leaf, stale last receipt or prefix conflict deny before
manager/Docker operations.

## CI scope and operational non-claims

`python -m pytest backend -q` and native Windows Python checks test
Merkle vectors, forged heads, malformed proofs, real SQLite restore
replay, wrong pins and Docker fail-closed operations. The two-tenant
dynamic-preview-operator CI uses **four ephemeral signing identities**,
all generated in the test runner; it is not proof of external custody.

This bounded full-leaf algorithm is NOT a compact RFC6962 inclusion or
consistency proof service, gossip protocol, externally accessible
append-only log, independent transparency monitor, freshness SLA,
Windows host firewall audit or production trust-anchor distribution.
Operating an actual external log requires separate infrastructure,
authorization, protected current-head delivery, scaling and legal review.
