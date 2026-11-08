# Phase 8 — disposable preview supply-chain operator runbook

**Disposable developer environment only.** Do not expose a preview to a
public network and do not run AI-authored Dockerfiles using this template.
Docker is invoked only by the local operator process.

## Preparing a candidate, not granting approval

Windows 10/11: use PowerShell, Git, Python 3.11, Node 22 and Docker Desktop
with WSL2 for Linux containers. `winget` is not required. Linux uses
the equivalent POSIX commands.

```powershell
git clone https://github.com/wawanwfs/AI-Office.git
cd AI-Office
npm ci
npx vite build --config examples/fullstack-preview/frontend/vite.config.mjs
New-Item -ItemType Directory -Force artifacts/fullstack-preview | Out-Null
npm sbom --sbom-format=cyclonedx --omit=dev | Out-File -Encoding utf8 artifacts/fullstack-preview/sbom.cdx.json
$env:PYTHONPATH = "backend"
python -c "import json; from preview_admission import candidate_manifest_for_ci_only; print(json.dumps(candidate_manifest_for_ci_only('examples/fullstack-preview'),indent=2))" | Out-File -Encoding utf8 candidate-only.json
```

Compare **every** file, lock, SBOM and image digest against an independently
reviewed trusted commit/release and relevant registry provenance before an
operator separately approves the JSON. A generated manifest is merely a
candidate. Never approve arbitrary uploaded source, hashes computed by an AI
agent or a checkout of unknown provenance.

The approved JSON has **exactly** these keys:
`version: 2`, `sources` (exact four SHA-256 sources),
`frontend` (all files under `artifacts/fullstack-preview/dist`, relative
file paths and hashes), `package_lock` (root lockfile hash),
`sbom` (CycloneDX JSON hash), and `images` (immutable `db`,
`api_base`, `ingress` references).

Place approved JSON in a PRIVATE directory; do not commit it as approval.

```powershell
$env:WFS_PREVIEW_TEST_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+','-').Replace('/','_')
python scripts/wfs_operator_preview.py start --approved --reviewed-manifest "C:\WFS-Private\approved-preview.json" --state-root "C:\WFS-Private\preview" --project demo-alpha --port 19010
python scripts/wfs_operator_preview.py stop --approved --discard-data --reviewed-manifest "C:\WFS-Private\approved-preview.json" --state-root "C:\WFS-Private\preview" --project demo-alpha
```

Every Docker command revalidates the trusted manifest. If files change,
all mutations fail closed. A denied start can leave registry state
`uncertain`; inspect Docker manually before an explicitly authorized cleanup.
The stop action discards disposable PostgreSQL data by design.

This checks local digest equality but is **not** a signed attestation,
complete dependency-reproducibility proof, malicious-worker boundary, proof
of DNS/IPv6 egress denial, or production acceptance. There is no external
multi-tenant interactive preview gateway in this phase.
