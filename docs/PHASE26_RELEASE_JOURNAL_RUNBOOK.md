# WFS AI Office — Phase 26 reference mTLS release journal

Phase 26 adds a remote alternative to the deliberately offline Phase 25
checkpoint. Start, logs and restart read live policy in remote mode.
A failed fetch denies the operation. No existing containers or volumes
are stopped or deleted automatically. The explicit Phase 24 stop path
still works without journal evidence.

## Publisher

Run the read-only reference process under a dedicated account. Provision a
server leaf/key, client CA, exact operator client leaf DER SHA-256, and
a separately pinned release-policy Ed25519 public key. The process must
only be able to read the journal and must not hold the policy signing key.
Do not expose the reference server to the public Internet.

```bash
python scripts/wfs_release_journal_server.py --bind 127.0.0.1 --port 9443 \
  --cert server.pem --key server-key.pem --client-ca operator-ca.pem \
  --client-fingerprint "$WFS_OPERATOR_CERT_PIN" --journal journal.json \
  --policy-key release-policy.pem --policy-fingerprint "$WFS_RELEASE_POLICY_PIN"
```

The offline signer publishes `{"entries":[...]}` by atomic replacement
and retains every previous record in sequence. Each entry contains
base64 `checkpoint` (exact JSON bytes) and `signature` (detached
Ed25519 base64). Use Phase 25 fields with version 2 and
`previous_sha256`, initially 64 zeroes and thereafter the SHA-256 of the
previous exact checkpoint. Sequence starts at 1. The signing context is
`WFS-AI-OFFICE:OCI-RELEASE-POLICY-CHECKPOINT:V2\n`.
The bounded reference profile accepts at most 64 records and has no
automatic rollover. Independently retain the current sequence and hash
outside SQLite and outside the publication host. The publisher rejects
replacement of history already served in that process. Across publisher
or operator restarts, the externally retained current anchor is essential.

## Operator

Keep the Phase 24 OCI and source-review flags. Use these policy flags
instead of local `--release-policy` and `--release-policy-signature`:

```text
--release-journal-url https://127.0.0.1:9443/v1/oci-release-journal
--release-journal-ca publisher-ca.pem
--release-journal-client-cert operator.pem
--release-journal-client-key operator-key.pem
--release-journal-server-sha256 <server leaf DER SHA-256>
--release-policy-public-key release-policy.pem
--trusted-release-policy-fingerprint <Ed25519 raw public-key SHA-256>
--minimum-release-policy-sequence <externally retained sequence>
--trusted-release-policy-sha256 <exact checkpoint SHA-256 at that sequence>
```

The expiry and future-clock bounds are unchanged. If the journal is down,
restore the authenticated source and verify the trusted anchor before
retrying. Do not switch to offline mode merely to evade an outage or a
revocation. CI uses synthetic certificates on one Linux runner, not
independent host custody or a production service.
