# WFS AI Office — Phase 20 hardened template-only Docker operator runbook

**Purpose:** on a disposable trusted Linux/WSL2 worker, build the reviewed API from an immutable kernel-sealed tar, then stream a second kernel-sealed image-only Compose document to Docker. The public gateway **never** receives a Docker socket, and arbitrary generated Dockerfiles are not admitted.

## Hardened operator flow

The existing `scripts/wfs_operator_preview.py` CLI (without a custom injected runner) now uses sealed mode by default. An attempt to disable sealed mode in the real operator constructor is explicitly rejected. The operator must still supply ALL independent Phase 10–18 reviewer, signed roster, witness and Merkle pins, a trusted approved manifest and disposable database root.

1. `reserve` validates signed review, limits project IDs and ports, and fences state transitions.
2. `start` stages approved files, verifies approved base-image digests, and explicitly ensures approved PostgreSQL/ingress images are available. This step CAN pull digest-pinned artifacts; **offline execution is not yet proven**.
3. The API Dockerfile and source go into a Linux kernel-memfd sealed tar. BuildKit cannot reread modified staging source during this build.
4. The built image is resolved to its **local Docker image ID**. The operator adds `api_image_id` to the SQLite registry in a create-only compatible migration; previously running legacy instances without a pinned ID must be reconciled manually before sealed lifecycle commands.
5. A canonical, deterministic operator transform removes the signed template's API `build:` block, inserts `image: sha256:...` with `pull_policy: never` and verifies there is NO runtime `build:` key.
6. The transformed Compose YAML is sealed in another Linux memfd and passed to `docker compose -f -` via stdin. The startup command is strictly `up -d --no-build --pull never`. Lifecycle `logs`, `restart`, `stop` and CI `exec` use the same derived image ID and sealed runtime input.
7. The real two-tenant Docker operator CI inspects actual running containers' `Image` field to require the exact pinned API image ID, and proves that modifying staged/live `api.py` while Compose starts does not change the resulting API image.

## Local acceptance on Linux or Linux Docker Desktop/WSL2 worker

```bash
export PYTHONPATH=backend
python -m pytest backend/test_preview_sealed_runtime.py backend/test_preview_sealed_build.py backend/test_preview_manager.py -q
```

The **full** real Docker proof additionally requires Node/npm, Vite dist, an approved CI-only CycloneDX SBOM, the registry and all cryptographic deps. Prefer the GitHub Actions `dynamic-preview-operator` job, which also proves the two-tenant HTTP and DNS constraints. Do not assume the Windows-native pytest job proves Windows Docker Desktop/WSL2 immutable mount or Linux worker UID separation.

Windows PowerShell:

```powershell
$env:PYTHONPATH = "backend"
python -m pytest backend/test_preview_sealed_runtime.py backend/test_preview_sealed_build.py -q
```

Windows must explicitly reject the kernel-sealed runtime, not downgrade to a writable tar. On Windows Docker Desktop use an **independently audited WSL2/Linux worker** before even considering a sealed operator; this Phase does not certify such a worker.

## Critical remaining risk

The original signed template still bind-mounts ingress source and frontend build output. Their *container-side readonly* property does not imply host immutability, and an attacker with the same host UID can alter the mount source. Docker daemon privileges, mutable SQLite pins and unsigned/local image provenance are NOT independently protected. The derived Compose only closes the **API source-build context** path, not all attack paths or total production readiness.

Real external transparency service, OS-separated principals, rootless daemon, offline full transitives, signed OCI provenance, host firewall, real production tenant HTTPS WS/SSE, encrypted multi-DB recovery and approved provider spend remain blocked.
