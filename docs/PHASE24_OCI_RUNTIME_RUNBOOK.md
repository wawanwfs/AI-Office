# WFS AI Office — Phase 24 approved OCI runtime

Use the source trust arguments from the existing operator and the release
evidence format from the [Phase 23 runbook](PHASE23_OCI_RUNBOOK.md).
Add these six flags for `start`, `logs`, and `restart`:

```text
--oci-archive reviewed-preview.oci.tar
--oci-approval approval.json
--oci-signature approval.sig
--oci-witness-key witness.pem
--trusted-oci-approval-sha256 <current out-of-band approval pin>
--trusted-oci-witness-fingerprint <out-of-band witness fingerprint>
```

The operator verifies the signed source and reviewer authority, then seals
a bounded copy of the OCI archive before reading it. Docker receives a
new sealed loader envelope, not the original untrusted tar metadata.
Its OCI manifest, config and layer payloads are byte-for-byte the ones verified against
the approved OCI manifest. No local image tag is part of admission.

Use a trusted Linux/amd64 Docker engine. Native Windows cannot start or
restart this path. The API archive may be approved for at most 24 hours
under the Phase 23 scheme. Supply the latest approval pin from outside
the operator state; expiration is checked when operating the stack and
does not itself continuously stop a running container. The DB and ingress
retain the preexisting reviewed provisioning path.

For a Phase 23 or interrupted stack, inspect status and explicitly
authorize `stop --discard-data` before rebuilding a disposable tenant.
Stop does not require an OCI release because it removes the stack and
does not launch an image. Source-review checks still apply. Keep the
approved source snapshot available for cleanup. A stopped preview needs
current evidence before it can be recreated.

The CI artifact `phase6-operator-preview-manager/operator-preview-proof.json`
records `phase24_oci_runtime`, including the manifest digest, config
digest, engine image ID, and distinct runtime instance IDs. `phase23_oci_release` is
still the separate offline verification step. The two-tenant HTTP proof
does not attest to a compromised daemon or off-host key custody.
