# Phase 10 — signed preview manager authority and synthetic offline QA

**Disposable operator-only reference template, not production admission.**
Keep the reviewer private Ed25519 signing key and the source of the
*trusted-policy SHA256* completely OUTSIDE the GitHub repository, CI and
Docker worker. A file hash calculated from the supplied policy is NOT
independent approval.

## Offline reviewer policy v1

Provision an independently audited JSON file `reviewer-policy.json`
with **exactly** these keys:

```json
{
  "version": 1,
  "epoch": 1,
  "active_fingerprints": ["<lowercase SHA-256 of authorized Ed25519 raw public key>"],
  "revoked_fingerprints": []
}
```

Fingerprint values are 64 lowercase hex characters. Keys may appear in
both lists, but `revoked_fingerprints` ALWAYS overrides the active list;
the manager refuses revoked signers. The operator must acquire the exact
SHA-256 of this policy **out of band**, from a separate trusted authority.
Tampering causes the manager to fail closed. A new epoch or roster
requires explicit independent reapproval and a NEW pinned SHA-256 value;
the program never silently accepts policy changes.

## Windows 10/11 PowerShell instructions

Follow [Phase 9 runbook](PHASE9_RUNTIME_RUNBOOK.md) to compile the
reviewed fixed preview, generate a *candidate only* v2 hash manifest,
and independently have it signed on an offline reviewer machine.
Then ensure Python dependencies are installed:

```powershell
python -m pip install -r requirements-pytest.txt
python -m pip install -r requirements-preview-crypto.txt
$env:PYTHONPATH = "backend"
$env:WFS_PREVIEW_TEST_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+','-').Replace('/','_')
$fp = "<reviewer public-key fingerprint obtained out of band>"
$policyPin = "<SHA256 of REVIEWED policy obtained out of band>"
$approval = @(
  "--reviewed-manifest", "C:\WFS-Private\approved-preview.json",
  "--reviewer-public-key", "C:\WFS-Private\reviewer-public.pem",
  "--review-signature", "C:\WFS-Private\review.sig",
  "--trusted-reviewer-fingerprint", $fp,
  "--reviewer-policy", "C:\WFS-Private\reviewer-policy.json",
  "--trusted-policy-sha256", $policyPin
)
python scripts/wfs_operator_preview.py start --approved --state-root "C:\WFS-Private\preview" --project demo-alpha --port 19010 @approval
python scripts/wfs_operator_preview.py status --approved --state-root "C:\WFS-Private\preview" --project demo-alpha @approval
python scripts/wfs_operator_preview.py stop --approved --discard-data --state-root "C:\WFS-Private\preview" --project demo-alpha @approval
```

**WARNING:** `stop --discard-data` destroys disposable PostgreSQL data.
If the policy is revoked or source changed, even status/stop fail closed.
Manually inspect Docker and re-establish separately authorized trust for
cleanup. Never bypass checks by feeding new candidate/self-signed hashes.

For Linux, use equivalent Python, npm and Docker commands and export
`WFS_PREVIEW_TEST_TOKEN` using `python -c 'import secrets; print(...)'`.
Rootless/restricted Docker isolation and production readiness are not
established by this runbook.

## CI and hash-locked offline installation (partial)

The `preview-crypto-offline` job builds an ephemeral, binary-only
wheelhouse on Linux for `requirements-preview-crypto.txt`, including
transitive dependencies. It creates SHA256-pinned package requirements,
installs using `--no-index --require-hashes`, then corrupts one wheel
and asserts pip rejects it. Evidence appears under
`artifacts/phase10-supply-chain/preview-crypto-wheelhouse.json`.
This is NOT a signed lockfile, authoritative package provenance,
all-package audit, Windows wheelhouse or offline Docker build.

The Docker `dynamic-preview-operator` CI proof uses an in-memory,
synthetic, self-signed CI identity to exercise fail-closed code paths;
**it does not carry independent reviewer approval**.
No hosted model, production cluster or billable endpoint is used.
