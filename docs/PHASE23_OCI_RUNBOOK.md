# WFS AI Office — Phase 23 OCI verifier runbook

Phase 23 is an offline **release evidence** check. Keep the Phase 22
operator flow unchanged. The release verifier does not load, run, or
approve a Docker container. It is intentionally not a general OCI
registry client or a general-purpose layer extractor.

## Disposable CI proof

The existing `dynamic-preview-operator` job validates both runtime stacks,
exports one reviewed API candidate using the Buildx `docker-container`
driver, and invokes the verifier in a separate process. The same sealed
tar format is used as the operator build context. Look for
`phase23_oci_release` in the operator proof JSON. The archive and synthetic
key are disposable. The JSON contains exact OCI manifest and config
digests, review/asset digests and the synthetic witness fingerprint.

## Verify an approved archive

A trusted reviewer must first independently verify the source approval
with the existing reviewer/roster/checkpoint process. Provision the
resulting canonical review SHA-256 and source reviewer fingerprint through
a trusted channel. The canonical review digest hashes
`canonical_review_bytes(review)` (including its domain prefix). Provision
the release-witness public-key fingerprint and the latest approval SHA-256
outside the builder and outside the local preview database. Never compute
trusted pins by trusting an archive supplier's accompanying files.

```bash
python backend/preview_oci_approval.py reviewed-preview.oci.tar \
  --review-path review.json --approval-path approval.json \
  --signature-path approval.sig --witness-key-path witness.pem \
  --trusted-approval-sha256 "$WFS_APPROVAL_PIN" \
  --trusted-witness-fingerprint "$WFS_RELEASE_WITNESS_PIN" \
  --trusted-reviewer-fingerprint "$WFS_REVIEWER_PIN" \
  --trusted-review-sha256 "$WFS_REVIEW_PIN"
```

The witness signs `approval_message(raw)` with an offline Ed25519 key.
The exact approval JSON contains version 1, `manifest_digest`, `platform`,
`review_sha256`, `frontend_sha256`, and Unix seconds `issued_at` and
`expires_at`. Lifetime is at most 24 hours. The detached signature is
base64. The frontend digest hashes the sorted compact JSON inventory.
Approval freshness assumes a trustworthy clock and a current off-host pin.

The verifier currently accepts one Linux/amd64 OCI image, gzip/plain
layers and a bounded BuildKit archive, not multi-platform indices or
attestation referrers. A Docker config/image ID is not an OCI manifest
digest. Windows-native operator startup remains fail-closed. The verifier
has no kernel-seal or Docker dependency for inspecting an existing archive.
