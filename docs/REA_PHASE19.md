# WFS AI Office — Phase 19 bounded REA: Linux kernel-sealed Docker tar input

**Starting reference:** latest `main` at development start `c4904c6b004018c539bf125cb4ce540af8e6cc82`. Phase 18 **44/50** narrowly accepted reliability/security gates. This phase proposes ONE additional testable build-input gate, not broad Phase 19 or production readiness.

## Gate 51 — signed reviewed source copied into a kernel-sealed BuildKit input tar

- [x] Read ONLY the already approved disposable API `Dockerfile.api` and `api.py` through O_NOFOLLOW file descriptors. Rehash bytes against *pre-approved manifest source SHA256*. No arbitrary user/model-created Dockerfile, source, path, image or Docker options.
- [x] Construct an explicit deterministic tar of the two reviewed files and copy it into Linux `memfd_create(MFD_ALLOW_SEALING)`. Apply and verify `F_SEAL_WRITE | F_SEAL_SHRINK | F_SEAL_GROW | F_SEAL_SEAL`, size and complete SHA256 **before** launching Docker. The tar remains a sealed kernel FD, not a mode-0444 regular file. No unsealed fallback on Windows or unsupported Linux kernels.
- [x] Real Docker BuildKit `docker build -f Dockerfile.api -` consumes the sealed descriptor via standard input, not a mutable checkout/context directory. The trusted operator supplies a fixed Docker build command and scoped synthetic CI image tag. A separate Docker `run` in network-none, read-only, nonroot/no-new-privileges/cap-drop mode measures the actual resulting `/app/api.py` SHA256 and compares it against the independently reviewed manifest digest.
- [x] Test an actual **same-UID separate process** attempting `write`, `ftruncate`, and reopening `/proc/self/fd` for write. All attempted mutations of the **sealed tar bytes** are denied; the measured tar SHA256 is unchanged. This protects the already-captured tar even if the original staged files are changed.
- [x] Real Linux Docker acceptance deliberately modifies the ordinary, mode-0444 staged `api.py` file as its owner **after** tar sealing, confirms normal snapshot review now denies it, completes a Docker image build while that staged file remains hostile, and verifies the new image still contains the signed/approved source. The staged file is restored and checked again before further existing two-tenant lifecycle tests.
- [x] Unit tests cover reviewed digest denial, symlink input denial, malformed build image tags, fixed tar allowlist and closed descriptors. Windows-native tests ensure unsupported Windows never silently substitutes writable temporary files.
- [x] Existing two-tenant Docker Compose, GitHub frontend/browser, native Windows, cryptographic transparency/restore acceptance remains intact. One extra build evidence section is included in the existing operator CI artifact.

## Explicitly NOT proven (cannot be promoted on this evidence)

- [ ] The ordinary production/operator Compose path still builds from a mode-0444 staged **directory**. This phase validates an alternative real BuildKit input path, but **does not switch live preview start/stop to the sealed image**. Therefore the full staging TOCTOU vulnerability is **not closed**.
- [ ] The BuildKit daemon still has its existing CI Docker privileges, and the trusted uploader/builder runs as the same operator principal. This does **not** prove OS-level separation of the builder, true rootless Docker, privilege confinement of a malicious Docker daemon, or an isolated independently managed worker.
- [ ] A same-UID attacker may rewrite the original staging directory; OS kernel seals protect only the material already copied into the memfd. No guarantee about malicious host kernel, daemon, VM layer or remote mutable image registry.
- [ ] No Windows native kernel memfd; no Windows Docker Desktop/WSL2 proof of an OS-enforced readonly builder. Unsupported platforms FAIL CLOSED. OCI image attestation, independent signed SBOM and fully offline package-lock/OCI transitives remain open.
- [ ] No independent 2-host transparency authority, WORM signing custody, external firewall/DNS, secure public preview or approved billable AI.

## Narrow acceptance score

Before full exact-SHA success on branch, PR, and post-merge `main`, record **44/51 accepted + 1 pending**. After all 13 required GitHub Actions jobs pass at each checkpoint, accept **45/51 = 88.2%** of narrowly selected acceptance gates. These fractions DO NOT measure total product feature completeness, completion of Phase 19, independent security assurance or production readiness.

No force push, production changes, unapproved model spend, or real trust pin resets.
