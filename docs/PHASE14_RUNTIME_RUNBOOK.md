> **Phase 15 trust update:** The Phase 14 witness-signed checkpoint
> now additionally requires a SEPARATELY signed, independently pinned
> Merkle tree head and ordered receipt inventory with prefix checks.
> Follow [Phase 15 operator instructions](PHASE15_RUNTIME_RUNBOOK.md).
> Older CLI examples do not contain all mandatory current arguments.

# WFS AI Office Phase 14 — witness-signed reviewer policy checkpoint

This is an incremental trust control for the **fixed reviewed disposable
preview template only**, not general generated project Docker builds.
Follow [Phase 13 runbook](PHASE13_RUNTIME_RUNBOOK.md) and
[Phase 12 roster signing runbook](PHASE12_RUNTIME_RUNBOOK.md).

## Independently controlled signing roles

Three **distinct** Ed25519 signing identities are required:

- Manifest reviewer signs the reviewed v2 source manifest.
- Reviewer-roster root signs the reviewer allowlist/revocation JSON.
- Checkpoint witness signs the current accepted epoch, policy SHA256
  and reviewer-roster root fingerprint in a separate receipt.

All private keys remain outside the operator host and repository.
The real operator independently verifies the latest witness receipt,
public-key fingerprint and receipt SHA256 through trusted separate
channels, not from an AI/LLM, untrusted source or same downloaded file.
The trust anchor MUST be maintained independently of the SQLite registry
and its backups. The repository/CI does not provision these anchors.

## Receipt schema and signing domain

Checkpoint JSON must have EXACTLY these fields:

```json
{
  "version": 1,
  "epoch": 1,
  "policy_sha256": "64-character lower-case SHA-256 hex of reviewer policy file",
  "roster_root_fingerprint": "64-character lower-case SHA-256 raw Ed25519 public key"
}
```

A trusted external witness signs the **exact UTF-8 JSON bytes** prefixed
with ASCII `WFS-AI-OFFICE:REVIEWER-CHECKPOINT:V1` followed by one newline.
Do not reserialize the receipt between signing and verification.
The signature file is base64 encoded detached 64-byte Ed25519 signature.
Witness rotation requires externally trusted verification and updated
pins; a new receipt cannot self-authorize itself.

On Windows 10/11 PowerShell, add these mandatory args to the complete
Phase 12 operator CLI invocation:

```powershell
$approval += @(
  "--witness-public-key", "C:\WFS-Private\witness-public.pem",
  "--witness-receipt", "C:\WFS-Private\current-checkpoint.json",
  "--witness-signature", "C:\WFS-Private\current-checkpoint.sig",
  "--trusted-witness-fingerprint", "<externally verified raw key SHA256>",
  "--trusted-checkpoint-sha256", "<externally verified latest receipt SHA256>"
)
python scripts/wfs_operator_preview.py status --approved --state-root "C:\WFS-Private\preview" --project demo-alpha @approval
```

`$approval` contains ALL prior reviewed-manifest, reviewer key/signature,
roster root/key/signature and their independent pins. Without them,
the operator must deny the operation.

## What the rollback regression proves

A real SQLite backup at epoch 1 is restored after a separately signed
epoch-2 roster and checkpoint were accepted. A restored SQLite floor of
epoch 1 cannot approve the old signed epoch-1 policy **as long as the
operator retains the independently verified current epoch-2 witness
checkpoint and pinned receipt SHA256**.

This is an external **pinned checkpoint design**, not an actual external
append-only log or hardware counter. If an attacker can also replace
the external pin with an old value, the registry and checkpoint can
both be replayed. Production needs independent protected custody,
witness availability/staleness policy and cross-host transparency.
Run CI on isolated disposable hosts only; CI's third signer is synthetic.
