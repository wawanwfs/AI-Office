# WFS AI Office — Phase 28 journal rotation

The mTLS route, policy signer and private durable state stay the same.
Every published window has at most 64 records. The initial window starts
at sequence 1. On rotation the new window starts with the old signed tip,
then the signed V3 bridge. The bridge links to the exact tip hash and
increments the global sequence. It copies the release, decision, and
timestamps unchanged. Normal V2 decisions may follow the bridge.

Before rotation, independently confirm and retain the full old window
and its signed tip. Have active operators observe the old tip, then
provision the old tip's sequence and exact hash as the new external anchor.
Do not overwrite the existing durable custody file. A lagging operator
whose local tip or external pin falls outside the retained window fails
closed. Recover it using the archived authenticated history and an
independently provisioned current anchor. Missing custody is not
automatically recreated.

On an offline signer workflow, run the following with the current public
key and independently confirmed fingerprint. The prepare output is the
exact domain-separated signing message:

```bash
python scripts/wfs_rotate_release_journal.py prepare \
  --journal full-window.json --policy-key policy.pem \
  --policy-fingerprint "$WFS_POLICY_FINGERPRINT" --output bridge-message.bin
# The offline authority signs bridge-message.bin and exports the detached signature as base64.
python scripts/wfs_rotate_release_journal.py assemble \
  --journal full-window.json --policy-key policy.pem \
  --policy-fingerprint "$WFS_POLICY_FINGERPRINT" --signature bridge.sig \
  --output rotated-candidate.json
```

After review and archive, publish the candidate atomically using the Phase 26
publisher procedure. A new signed allow decision is required to lift a
revocation. An expired decision cannot gain lifetime merely by rotating.
The local reference publisher is not external immutable storage.

See `phase28_journal_rotation` in the dynamic preview evidence.
