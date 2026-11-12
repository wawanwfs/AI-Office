# WFS AI Office — Phase 20 bounded REA: sealed image-only operator Compose lifecycle

**Baseline:** Phase 19 final verified `main` at `0144547b668577ed60e4d5e8707800f708db4333`, with **45/51** narrowly accepted gates. This change proposes ONE new gate. The UI underwent separate continuous commits after this baseline; Phase20 was branched from `5184b216d08d24e6e03f33928a76473f62245c6d`.

## Gate 52 — operator API is built from sealed bytes, and Compose receives ONLY an image ID on sealed stdin

- [x] The **real operator CLI** uses hardened mode by default and refuses an explicit legacy-build bypass. The synthetic injected unit runner retains historical lifecycle behavior to keep old test contracts isolated and labeled. The real two-tenant Docker CI explicitly opts into hardened mode.
- [x] Operator start verifies all Phase 10–19 signatures, witnesses and review pins; stages the approved template; builds API from a Linux kernel-sealed two-file Docker tar. The builder checks the exact signed source hashes before BuildKit consumes its sealed stdin.
- [x] Inspect the resulting local Docker image and record its **engine image ID** (`sha256:<64hex>`) in the operator SQLite registry, with additive migration for legacy registries. This is local content-addressable image identity, **NOT** a remote OCI manifest digest, signed registry attestation or external image approval.
- [x] Derive the runtime YAML by ONE deterministic replacement in the signed+hashed original template: remove the existing API `build:` stanza and insert exact `image: sha256:<local-ID>` and `pull_policy: never`. Refuse malformed hashes, extra `build:` keys or altered template bytes.
- [x] Store the complete derived Compose bytes in another Linux sealed memfd (write/grow/shrink/seal), verify its complete SHA256 and stream them through `docker compose -f -` **stdin** on every lifecycle action. There is no writable derived Compose file. Startup invokes exactly `up -d --no-build --pull never`; no live API source build is permitted by the reviewed operator.
- [x] Explicitly resolve the separately reviewed digest-pinned PostgreSQL and ingress image references before startup (network pulls remain possible before the no-pull Compose action). This is not full offline supply-chain proof.
- [x] Real Linux CI runs two tenant-managed stacks, intentionally edits BOTH live checkout and operator staging `api.py` after the runtime config is sealed, and demonstrates that actual launched API container image ID equals the recorded, prebuilt image ID. Existing database health, isolated tenant authentication, DNS rebinding and Docker cleanup still run.
- [x] Targeted Python regressions validate template transformation, bad/missing image ID, image substitution, legacy CLI denial, memfd same-UID write failure, Windows fail-closed behavior and signed snapshot mutation rejection. Python, native Windows, SAST, browser and the full 13-job CI gate remain mandatory.
- [x] Repair pre-existing `main` frontend CI failure where asset-reading landing/PWA tests ran before the required `dist/` build. The same test suite is now executed AFTER `npm run build`.

## Remaining P0 boundaries (NOT proven by this gate)

- [ ] This does NOT establish a separate OS principal/UID for builder, staging writer or Docker daemon, rootless Docker, a malicious privileged daemon defense or Windows Docker Desktop/WSL2 mount/namespace evidence. Windows only verifies fail-closed rather than pretending to support Linux memfd.
- [ ] The running API uses immutable local image ID, but the signed Compose template still defines `ingress.py` and frontend dist as read-only **bind mounts from staging**. Read-only from the container does NOT stop a same-UID host actor editing mount source while a preview is running. Full runtime immutable mounts/verity/image packaging and independently privileged principals remain blocked.
- [ ] Local Docker `sha256:...` is a **local image configuration digest**, not an independently signed or transparently witnessed OCI registry manifest digest. The Docker daemon is trusted, and pip/npm/OCI supply chain is not a fully hash-locked or offline reproducible build.
- [ ] A same-UID actor may tamper with local operator SQLite storage/image pins, change host-level Docker state, or prevent cleanup. Separate immutable external pin enforcement and independent host audits remain required.
- [ ] No real two-host transparency WORM authority, independent DNS/firewall or quotas, production HTTPS tenant WS/SSE, multi-DB encrypted restore, guaranteed live three-floor telemetry, or paid AI authorization.

## Narrow gate accounting

Previously accepted: **45/51**. Until PR branch+PR and exact post-merge main each complete 13/13 green, report **45/52, one pending**. If verified, one additional gate accepted: **46/52 = 88.5%** of *selected security/reliability checks*. Not Phase20 completeness, total product progress, or production certification.

No force push, public deployment, paid model/API usage, trusted private signing keys or production source admissions were introduced.
