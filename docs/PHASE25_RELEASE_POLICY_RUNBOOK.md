# WFS AI Office — Phase 25 operator release policy

The disposable Linux operator retains all Phase 24 signed-source and OCI
requirements. For `start`, `logs`, and `restart`, additionally supply:

```text
--release-policy checkpoint.json
--release-policy-signature checkpoint.sig
--release-policy-public-key policy.pem
--trusted-release-policy-sha256 <current checkpoint SHA-256>
--trusted-release-policy-fingerprint <Ed25519 raw public-key SHA-256>
--minimum-release-policy-sequence <independent monotonic floor>
```

The key is distinct from the OCI release witness and source reviewer.
The trusted head digest, key fingerprint and sequence floor must come
from a trusted channel outside the builder and outside SQLite. Retain
the latest floor when recovering an operator database. Do not calculate
trust pins by trusting an archive supplier's files.

The authority signs the exact JSON bytes, prefixed by
`WFS-AI-OFFICE:OCI-RELEASE-POLICY-CHECKPOINT:V1\n`, with Ed25519. The
detached signature uses base64. The record contains `version: 1`,
`sequence`, `manifest_digest`, `approval_sha256`, `platform`
(`linux/amd64`), `decision` (`allow` or `revoke`), and integer Unix
seconds `issued_at` and `expires_at`. For allow, lifetime is at most
600 seconds, with 30 seconds of future tolerance for the issue time
and no grace period after expiry.

`stop --discard-data` does not require release policy material or OCI
approval, but still requires operator authorization and the existing
trusted source checks. Expiry or revocation alone does not terminate an
already running container. No periodic watchdog is installed. This
design assumes a trustworthy operator clock and timely distribution of
current external pins. Simultaneous rollback of the external pins and
sequence floor is outside the tested boundary.

Check `phase25_release_policy` in the existing dynamic operator CI
artifact. The synthetic authority is not a deployed off-host service.
