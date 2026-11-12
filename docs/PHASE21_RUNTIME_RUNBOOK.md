# WFS AI Office — Phase 21 sealed ingress image operator runbook

This is a **disposable signed-template-only** extension of Phase 20. It does not admit arbitrary generated Dockerfiles or publicly expose preview containers.

## New hardened lifecycle

1. Verify the existing independent manifest / signed authority / witness / log pins and stage the immutable-by-digest review snapshot.
2. Fetch only previously authorized pinned runtime base images, then build the signed API from sealed BuildKit stdin (Phase 20).
3. Read reviewed `ingress.py` from a secure FD and compare its exact approved SHA256. Generate the fixed ingress Dockerfile using only the previously signed digest-pinned Python base, then pack these two files into a kernel-sealed tar.
4. Build the ingress image from sealed stdin, inspect the resulting local Docker engine image ID, and store it as `ingress_image_id` alongside `api_image_id`.
5. Derive a second kernel-sealed Compose document. Pin both API and ingress to their **local** `sha256:` IDs, remove the ingress host bind and require `pull_policy: never`. The operator executes `docker compose -f - up -d --no-build --pull never`.
6. Inspect both actual tenant ingress containers (not simply Compose YAML) to verify the recorded image IDs and absence of `/app/ingress.py` mounts. Change the staging and live checkout ingress bytes during authenticated HTTP requests to confirm they cannot affect the running container.

## Review/test commands

Linux (Docker not required for unit proof):

```bash
PYTHONPATH=backend python -m pytest backend/test_preview_sealed_runtime.py backend/test_preview_sealed_build.py backend/test_preview_manager.py -q
```

Windows-native Python regressions must fail closed on Linux memfd seal creation:

```powershell
$env:PYTHONPATH = "backend"
python -m pytest backend/test_preview_sealed_runtime.py backend/test_preview_sealed_build.py -q
```

Real two-tenant Linux Docker proof (requires full GitHub Actions dependencies, prebuilt Vite assets, trusted disposable CI setup):

```bash
python scripts/ci_dynamic_preview_operator.py
```

Prefer the CI job `dynamic-preview-operator`; its artifact `phase6-operator-preview-manager/operator-preview-proof.json` records the actual inspected image IDs and host-tamper HTTP proof. For reporting, require all **13** checks of the exact proposed commit's branch, PR and post-merge `main` to finish green.

## Remaining risks

The API's frontend `dist` assets are still mounted from mutable staging. The local daemon and SQLite remain operator-trusted; rootless / separate OS identities, off-host signatures/OCI provenance, offline full closure, native Windows Docker Desktop/WSL2, external WORM logs and public HTTPS previews are **not** proven. Native Windows must not silently fall back to writable host build contexts. Billing-model credentials, prices and hard caps remain blocked pending owner approval.
