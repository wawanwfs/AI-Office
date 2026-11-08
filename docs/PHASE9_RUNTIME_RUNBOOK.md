# Phase 9 — signed local preview operator & disposable egress proof

**No production execution. No unreviewed AI-authored Dockerfile or image.**
The CLI now requires an independently trusted Ed25519 reviewer to sign its
**v2** manifest. A signature does not certify a correct or independently
audited manifest; reviewers must independently inspect all bytes, registry
digests, dependencies and intended effects.

## Step 1 — disposable developer host

Windows PowerShell 10/11 or Linux with Python 3.11, Node 22 and Docker
Desktop/WSL2 (Windows) or local Docker Engine (Linux).
The environment must be isolated from customer and production resources.

```powershell
git clone https://github.com/wawanwfs/AI-Office.git
cd AI-Office
python -m pip install -r requirements-pytest.txt
python -m pip install -r requirements-preview-crypto.txt
npm ci
npx vite build --config examples/fullstack-preview/frontend/vite.config.mjs
New-Item -ItemType Directory -Force artifacts/fullstack-preview | Out-Null
npm sbom --sbom-format=cyclonedx --omit=dev | Out-File -Encoding utf8 artifacts/fullstack-preview/sbom.cdx.json
$env:PYTHONPATH = "backend"
python -c "import json; from preview_admission import candidate_manifest_for_ci_only; print(json.dumps(candidate_manifest_for_ci_only('examples/fullstack-preview'),indent=2))" | Out-File -Encoding utf8 candidate-only.json
```

The reviewer-signature verifier is pinned separately to preserve the six
historical pytest requirements and is audited independently in CI.

**Candidate-only.json is NOT approval.** An independent reviewer must
validate the exact four source hashes, exact frontend asset inventory,
root package lock, SBOM and all pinned image references against trusted
provenance. The reviewer signs the canonical v2 JSON using a private
Ed25519 key stored ONLY on a separate trusted signing machine, never on
the Docker operator machine, GitHub Actions or Git checkout. Use
`preview_signature.canonical_review_bytes(manifest)` as the signed data
(UTF-8 canonical JSON prefixed by the domain separator). The detached
signature is **base64-encoded 64-byte Ed25519 signature**; no signing key
is generated or stored by WFS AI Office.

The trusted key fingerprint is calculated from the reviewer's raw 32-byte
Ed25519 public key as **lowercase SHA-256 hex**. The value is pinned
out-of-band from the reviewer, NOT calculated from an untrusted manifest,
public-key upload or candidate source. The public key is PEM.

Copy the separately reviewed `approved-preview.json`, `review.sig`,
and `reviewer-public.pem` into a secured local operator directory. Keep
reviewer's private key OFF this computer. Never paste any private key into
chat, CI, logs or the repository.

## Step 2 — launch with verified offline approval

```powershell
$env:WFS_PREVIEW_TEST_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+','-').Replace('/','_')
$fp = "<trusted fingerprint SHA-256 obtained OUT OF BAND>"
$approval = @(
  "--reviewed-manifest", "C:\WFS-Private\approved-preview.json",
  "--reviewer-public-key", "C:\WFS-Private\reviewer-public.pem",
  "--review-signature", "C:\WFS-Private\review.sig",
  "--trusted-reviewer-fingerprint", $fp
)
python scripts/wfs_operator_preview.py start --approved --state-root "C:\WFS-Private\preview" --project demo-alpha --port 19010 @approval
python scripts/wfs_operator_preview.py status --approved --state-root "C:\WFS-Private\preview" --project demo-alpha @approval
python scripts/wfs_operator_preview.py stop --approved --discard-data --state-root "C:\WFS-Private\preview" --project demo-alpha @approval
```

The stop action DELETES disposable PostgreSQL volumes with explicit
approval. A failed or uncertain lifecycle requires independent Docker
inspection; no automatic rerun or destructive cleanup.

## Step 3 — scoped CI proof

The CI `dynamic-preview-operator` job starts two actual disposable
PostgreSQL/FastAPI/React stacks using a *trusted checkout only*, then runs
`scripts/ci_preview_network_probe.py` inside the actual API containers.
It checks public IPv4 and IPv6 TCP sockets, link-local metadata, an
explicitly simulated DNS rebound, no leaked proxy environment, and actual
per-service network attachment. CI itself only creates *candidate hashes*
and does NOT claim a separate external reviewer signature. Native Windows
tests validate Ed25519 signatures, but do not run Windows Docker Desktop.

**Unverified:** real DNS rebinding on a hostile resolver, full-stack
signed dependency provenance, complete Python transitive hashes, all image
SBOMs, registry attestations, production daemon separation, genuine
Windows/Linux cleanroom and reliable rollback. This is not a network
firewall certification or deployment authorization.
