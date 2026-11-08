> **Phase 12 update:** Independent signed reviewer-roster authority is
> now mandatory at every manager entry point, in addition to the Phase 11
> SHA-pin and local epoch floor. Use the
> [Phase 12 runbook](PHASE12_RUNTIME_RUNBOOK.md) for the three new CLI args.

# Phase 11 — staged Docker source and local reviewer epoch protection

For **isolated, disposable operator use only**. Read [Phase 10 runbook](PHASE10_RUNTIME_RUNBOOK.md)
for reviewer policy format and the independently approved v2 manifest.
No public gateway Docker socket; do not run unreviewed AI-generated source.

## Exact source admission

After the external reviewer approves the four source hashes, frontend
asset inventory, package-lock, CycloneDX SBOM and digest-pinned image
references, the trusted operator's CLI uses the existing Phase 10 options:
`--reviewed-manifest`, `--reviewer-public-key`,
`--review-signature`, `--trusted-reviewer-fingerprint`,
`--reviewer-policy`, `--trusted-policy-sha256` and `--approved`.
No private Ed25519 signing key enters the operator machine.

Phase 11 writes a private staged build under:

`<state-root>/preview-snapshots/<project-hash>/examples/fullstack-preview/`

The adjacent staged paths include:

`artifacts/fullstack-preview/dist/`, `artifacts/fullstack-preview/sbom.cdx.json`
and `package-lock.json`.

Docker Compose `up --build`, `logs`, `restart`, and `down`
all use the staged Compose filename; the live checkout is NOT its build
context or volume source. Missing, changed or symlinked files fail closed.
Stage files are read-only on POSIX for accidental-write resistance; the
operator user still controls the staging directory. Windows needs properly
configured NTFS ACLs; do not claim the snapshot is OS-immutable.

**Disposable stop deletes both PostgreSQL volumes and the private staged
tree only after explicit `--discard-data`.** A partial Docker failure
retains the stage for independent reconciliation. Only an authorized
operator with the intended permissions should perform cleanup.

## Local epoch floor

Every accepted reviewer policy stores its highest seen `epoch` and exact
policy SHA256 in the **same private SQLite registry** as the preview
instances. A lower old epoch fails even if correctly re-signed and pinned;
an altered policy with the same epoch also fails. A legitimately approved
higher epoch can be accepted by a NEW manager instance using the new
independently pinned policy file. Replaying or deleting the private
SQLite DB bypasses its local history, so store it under restricted ACLs
and use independently audited backup/restore procedures. This is not
tamper-resistant hardware-backed anti-rollback.

## CI evidence and limitations

`dynamic-preview-operator` exercises two real disposable Compose tenants
and injects a malicious live-checkout `api.py` replacement during an
actual Docker build; the staged source remains unchanged and the
test-only service continues healthy. Unit tests additionally replace a
different source file DURING snapshot copying, verify no staged context
is published, and exercise real SQLite policy rollback denials on
Linux/Windows CI Python.

These checks DO NOT test a malicious same-UID process changing staged
files while Docker reads them. The Dockerfile still installs Python
packages online and image registry signature verification is absent.
No production cluster, authorization, secrets or real paid LLM usage
is involved.
