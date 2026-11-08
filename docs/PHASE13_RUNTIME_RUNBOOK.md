> **Phase 14 trust update:** In addition to the Phase 12 independently
> signed reviewer roster, preview operators now MUST supply a separately
> signed and independently pinned CURRENT witness checkpoint. Follow the
> [Phase 14 witness runbook](PHASE14_RUNTIME_RUNBOOK.md) for the five new
> mandatory CLI args. The CI DNS proof remains disposable/internal only.

# Phase 13 — controlled real UDP DNS rebinding in Docker CI

The new probe is test-only. Follow [Phase 12 runbook](PHASE12_RUNTIME_RUNBOOK.md)
for independently approved manifest and reviewer roster Ed25519 keys.
The fixed reference template and old approval gates are unchanged.

The dynamic-preview-operator GitHub Actions job creates two actual
isolated template previews. For each, an additional ephemeral DNS
sidecar is attached only to the preview-internal bridge. The sidecar
runs non-root with all capabilities dropped, read-only filesystem,
no host mount or published port and strict memory/PID limits.

The running API makes **actual UDP requests** to the sidecar on port
1053, checks the authoritative DNS AA bit and TTL=0 and observes
alternating A and AAAA responses. TCP attempts to the returned
metadata, public IPv4 and public IPv6 addresses must all fail from
the API. The test keeps the real application healthy on loopback and
removes the sidecar in a finally block.

Reproduce via the normal CI workflow in a disposable branch and
inspect the dynamic-preview-operator job and uploaded
phase6-operator-preview-manager artifact. Runner script:
python scripts/ci_dynamic_preview_operator.py

Prerequisites: trusted checkout, Docker Compose, Python 3.11, npm ci,
built frontend dist, test requirements and the synthetic-only CI
reviewer signer. Do not copy CI private keys into operator trust stores.

**Non-claims:** The probe uses a separately running authoritative
sidecar on the SAME internal Docker network. It is not an external
public DNS authority, a system-wide resolver override, proof DoH
or proxy channels are blocked, a host-firewall audit or Windows
Docker Desktop/WSL2 security acceptance. No public port, paid AI,
production cluster or arbitrary generated source is involved.
