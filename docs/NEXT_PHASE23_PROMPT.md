# WFS AI Office — Phase 23 accelerated execution prompt

Start from the latest green `main`. Read
[Phase 22 REA](REA_PHASE22.md), [its runbook](PHASE22_RUNTIME_RUNBOOK.md),
the sealed build/runtime modules, the signed authority/witness modules, and
the latest Docker proof artifact. Confirm the exact baseline SHA and all
13 CI jobs. Preserve all green gates and avoid force push, auto-deploy,
signing-root resets and paid provider calls.

## P0 — Bind a reviewed release to independently verified OCI content

1. Keep the operator path mount-free. Export the fixed preview build as
   an OCI image layout on a disposable runner. Verify the manifest digest,
   platform, config and layer digests by hashing their exact bytes in a
   separate verifier. Do not treat a local image config ID as the OCI
   manifest digest.
2. Design a bounded signed approval with a separate pinned witness identity.
   Bind the approved manifest digest, platform and reviewed asset inventory
   together. Add fail-closed tests for missing approvals, valid-but-stale
   approvals, mismatched platform, and invalid descriptor or blob hashes.
   Treat CI keys as synthetic and report any missing off-host authority.
3. Preserve the two-tenant Docker and HTTP proof. Before claiming a
   rootless boundary, demonstrate separate writer/builder/gateway OS
   principals and an independently controlled verifier. Verify Linux
   first. Keep native Windows fail-closed until WSL2/Docker Desktop is
   tested on an appropriate host.

Keep separate work items for offline Python/npm/OCI dependency closure and
independent SBOM, external mTLS/WORM freshness and host network policy,
public HTTPS/WS/SSE tenant isolation, encrypted multi-database restore,
live Office telemetry and invoice reconciliation. Do not activate any
billable provider without explicit owner authorization of the model,
credential, pricing and hard spending caps.

Land at least one meaningful code gate, verify exact branch, PR and
post-merge `main` CI, and publish scoped numerator/denominator, remaining
limitations and the next prompt.
