# WFS AI Office — Phase 22 disposable operator runbook

Use the signed-template Linux operator workflow from
[Phase 21](PHASE21_RUNTIME_RUNBOOK.md). The original Compose and Dockerfile
stay in the signed source manifest. The operator checks the staged asset
inventory against the same signed `frontend` map, rechecks each opened
file's exact bytes, and places only those assets under `dist/` in the sealed
tar. A fixed `COPY` adds them to the API image. Derived Compose removes
both host binds. It retains read-only API/ingress filesystems and loopback
ingress.

Existing Phase 21 previews still have their original mounts. For disposable
instances, confirm data loss, stop using the authorized operator command,
then start again using the reviewed snapshot and ephemeral token. Do not
try to upgrade by restarting a legacy container or editing SQLite. If
approved inputs or image IDs are missing, reconcile using the trusted
operator runbook before retrying.

Linux checks without Docker:

```bash
PYTHONPATH=backend python -m pytest backend/test_preview_sealed_build.py backend/test_preview_sealed_runtime.py backend/test_preview_manager.py -q
```

On a disposable Linux Docker CI host with the dependencies, Vite output and
SBOM built as in `dynamic-preview-operator`:

```bash
python scripts/ci_dynamic_preview_operator.py
```

Inspect the artifact `phase6-operator-preview-manager/operator-preview-proof.json`
for `phase22_mount_free_frontend`. Both tenants must have a pinned local
image ID, read-only rootfs, no bind or named volume, and an in-container
inventory matching the signed hashes. The HTTP proof checks all asset bytes
and `/` from outside the containers while both staged and source assets
are modified. This does not attest to a malicious daemon's behavior.

Native Windows Python must deny sealed operator startup without contacting
Docker. WSL2 is a possible Linux execution environment but remains
unverified with Docker Desktop. No writable fallback is supported.
