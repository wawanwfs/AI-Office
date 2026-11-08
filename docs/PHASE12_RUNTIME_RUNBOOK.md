> **Phase 13 CI note:** The disposable operator now tests actual
> DNS response packets from an isolated internal-only Docker DNS
> container (not merely simulated address replacement).
> See [Phase 13 runtime runbook](PHASE13_RUNTIME_RUNBOOK.md).
> This does not expand the Phase 12 reviewer approval boundary.

# Phase 12 — independent offline signature for reviewer-roster policy

This is a **disposable local operator** security boundary only. Continue
to follow [Phase 11 runbook](PHASE11_RUNTIME_RUNBOOK.md) for the fixed
reviewed preview template, state root and Docker admission constraints.

## Separate signer duties

The **reviewer** signs only the v2 manifest bytes (existing Phase 9/10
process). A **separately trusted roster-root authority** signs the v1
reviewer allowlist/revocation policy. These MUST use distinct Ed25519
private keys with separate offline custody. Neither private key belongs
in GitHub Actions, the Docker operator machine, .env, chat, logs or the
repository. CI makes ephemeral synthetic identities for tests ONLY.

The roster root signs the exact bytes of the separately audited
`reviewer-policy.json` with domain separator:

```python
from preview_root_authority import canonical_roster_bytes
bytes_to_sign = canonical_roster_bytes(open("reviewer-policy.json", "rb").read())
# Sign bytes_to_sign on an OUT-OF-BAND trusted signer, never here.
```

The resulting detached signature is a base64-encoded **64-byte Ed25519**
signature, stored as `reviewer-policy-root.sig`. Copy only the
PUBLIC root PEM and signature to your locked-down operator host.
Provision the root's fingerprint, SHA-256 of the **raw 32-byte Ed25519
public key**, from a separate trusted authority/channel.

## Windows 10/11 PowerShell operator example

Follow the reviewed candidate and existing CLI arguments in
[Phase 11 runbook](PHASE11_RUNTIME_RUNBOOK.md), then supply these THREE
additional required arguments:

```powershell
$approval += @(
  "--roster-root-public-key", "C:\WFS-Private\roster-root-public.pem",
  "--roster-root-signature", "C:\WFS-Private\reviewer-policy-root.sig",
  "--trusted-roster-root-fingerprint", "<SHA256 raw Ed25519 root key obtained independently>"
)
python scripts/wfs_operator_preview.py status --approved --state-root "C:\WFS-Private\preview" --project demo-alpha @approval
```

`$approval` is the full Phase 11 argument array: reviewed manifest,
reviewer public PEM + signature + out-of-band fingerprint, roster policy,
the independently pinned policy SHA256, and the THREE new root values.
All are mandatory to call `SignedPreviewAuthority` programmatically.

The exact policy file bytes must match BOTH the independently approved
SHA256 AND the root's detached Ed25519 signature. Updating the roster
requires a new **externally authorized** signature and, if epoch changes,
a monotonic higher `epoch`; the operator's local SQLite floor enforces
lower-epoch denial. The root fingerprint is not derived from the policy
or operator-provided public key.

**Scope warning:** This does not prove an offline signing device or
organizational identity exists; no production root key is configured by
the repository. A malicious operator with access to the state database,
root key custody or filesystem staging can still defeat parts of the
boundary. An independent log/counter and OS-enforced immutability remain P0.
