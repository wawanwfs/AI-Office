# Phase 19 — Linux kernel-sealed Docker BuildKit input (bounded research/operator runbook)

**Security boundary:** only the previously signed and reviewed *disposable* WFS API template. No generated Dockerfile admission. The normal template preview Compose path is **unchanged**. This is an optional **real Docker build from sealed stdin** acceptance path; it is not a production builder.

## Architecture

1. The existing operator validates reviewer, roster, witness and independently pinned Merkle proof, then stages a per-project allowlisted snapshot.
2. The Phase 19 code calls `snapshots.verify(project_id)`, reopens only `Dockerfile.api` and `api.py` with O_NOFOLLOW and checks exact SHA256 against the reviewed manifest. No file tree traversal or user-controlled file names.
3. It writes a deterministic 2-file tar to a **Linux memfd** and invokes kernel `F_ADD_SEALS` with write/shrink/grow/seal. It checks seals, size and tar SHA256 before building.
4. BuildKit receives the actual sealed tar on standard input using `docker build -f Dockerfile.api -`, not a Docker build-context path that the staging owner can replace.
5. CI changes `api.py` in staging while Docker is building, and confirms the resulting image contains the expected pre-reviewed `api.py`. Tests also attempt `write/ftruncate/reopen-write` of the inherited sealed FD from a separate same-UID Python process.

`chmod 0444` is **not** an OS immutable boundary against the file owner: the owner can `chmod` and rewrite it. Kernel seals forbid the specific tar-byte changes regardless of owner. They do **not** protect the external staged directory, Docker daemon, registry or host kernel.

## Run tests

Linux with Docker/BuildKit, and the test dependencies installed:

```bash
export PYTHONPATH=backend
python -m pytest backend/test_preview_sealed_build.py -q
# The real signed-template two-tenant operator integration CI job
# produces artifacts/phase6-preview-manager/operator-preview-proof.json
python scripts/ci_dynamic_preview_operator.py
```

The operator integration script also requires the existing full GitHub Actions dependencies (npm, CycloneDX SBOM, real Vite preview dist, PostgreSQL images, etc.). Prefer the pinned `dynamic-preview-operator` GitHub Actions job for reproducibility. Run only on a disposable Docker host.

## Windows 10/11 PowerShell

```powershell
$env:PYTHONPATH = "backend"
python -m pytest backend/test_preview_sealed_build.py -q
```

The Linux-only tests skip, and the explicit Windows regression **confirms fail-closed behavior**. Do not silently use a Windows regular temporary tar as a substitute for a sealed Linux memfd. Docker Desktop with a WSL2/Linux builder must separately prove the mount/namespace/uid boundary and cannot inherit these Linux CI claims automatically.

## Unfinished P0 work

- Integrate sealed images into the ordinary **manager-controlled Compose lifecycle** and independently verify that Compose never rebuilds from a writable source path.
- Separate staging writer UID, trusted source approver, Linux rootless builder and public gateway principals. Require no Docker socket/capabilities in any user-facing service; test a malicious privileged daemon and source actor.
- Prove actual immutable Linux mounts and Windows Docker Desktop/WSL2 ownership/mount flags, build provenance, signed registry digests, offline transitive dependency locks, SBOM/CVE, independent DNS/firewall.
- Finish true independent remote HTTPS/WORM log witnessing and other Phase19 priorities.

No production migration, host-wide daemon changes, public endpoint, paid provider, root key, or irreversible action is authorized by this test.
