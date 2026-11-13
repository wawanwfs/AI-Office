# WFS AI Office — Phase 24 OCI runtime promotion

Baseline: `78427b999e5e795bf9e66dd2589f2c0b8bcd7aec`. All 13 jobs passed
in [baseline run 43442926620](https://github.com/wawanwfs/AI-Office/actions/runs/43442926620).
Phase 23 accepted 49 of 55 scoped gates.

## Gate 56 — Start the preview API from the approved OCI content

- Verify current out-of-band release and witness pins against the signed
  source approval. Reject absent, replaced, expired or rolled-back
  evidence and invalid platform, manifest or blob data.
- Freeze the archive with Linux memfd seals before verification. Repack
  only the verified, exact manifest, config and layer bytes into a tagless Docker
  load transport, seal it too, and load from stdin.
- Check Docker's image ID, platform and ordered uncompressed DiffIDs.
  Compose pins the verified engine image ID, disables pulls and builds, and keeps
  frontend and ingress bind-free. Persist separate OCI manifest, config
  and API container IDs. Check the running container before marking it live.
- In two-tenant Docker CI, compare served asset hashes and runtime image
  IDs. Reopen operator state, restart both tenants, and stop and recreate
  a tenant from the approved release. Keep native Windows fail-closed.

Gate 56 is pending until the exact branch, PR and post-merge main each
complete all 13 jobs. Then the scoped total is **50/56 (89.3%)**, up
from **49/56 pending**. This is not a production-readiness estimate.

The Linux runner still trusts Docker, the operator process and its state.
CI signs with synthetic keys. No production registry attestation,
off-host witness custody, separate OS principals, trusted external clock,
continuous revocation, or WSL2/Docker Desktop validation is claimed.
