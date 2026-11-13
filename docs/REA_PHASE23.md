# WFS AI Office — Phase 23 OCI release verification

Baseline: exact green `main` commit `fc05542a918d2317394ed2c4bbcbf22e8d7c392f`
with all 13 jobs successful in [run 43373303288](https://github.com/wawanwfs/AI-Office/actions/runs/43373303288).
Phase 22 accepted 48 of 54 scoped gates.

## Gate 55 — independently check the exported release bytes and pinned approval

- Export the fixed reviewed API build from Linux kernel-sealed stdin
  using the OCI BuildKit exporter on a disposable builder.
- Verify a single `linux/amd64` OCI layout without Docker. Hash the exact
  manifest/config/compressed layer bytes and verify uncompressed DiffIDs.
  Confirm the packaged API hash and exact frontend inventory match the
  reviewed material. Do not extract or run layer contents.
- In a verifier process separate from Docker, verify an expiring,
  domain-separated Ed25519 approval under an independently supplied
  witness fingerprint, current approval pin, and reviewed-source pin.
  Reject missing approvals, stale or superseded approvals, platform
  mismatches, altered images, and descriptor and payload errors.
- Preserve real two-tenant mount-free preview and HTTP checks.

Gate 55 is pending until 13/13 CI jobs pass on the exact branch, PR
and merged `main`. Accounting then changes from **48/55 pending**
to **49/55 (89.1%) accepted**. This counts selected audit gates only.

The synthetic CI witness runs on the same runner as the builder. This is
process-level separation and archive verification, not independent
physical custody, production daemon resistance, or registry provenance.
The exported image is not what Phase 22's local-image Compose admission
enforces. Real off-host pins, OS separation, signed runtime promotion,
Windows/WSL2 acceptance, external WORM, offline dependency closure,
public previews, and paid providers are not certified.
