# WFS AI Office — Phase 27 Linux custody

The reference publisher and runtime remain single-host in CI. The
acceptance job uses a disposable privileged supervisor to provision five
non-root probe identities and exercise the existing non-root operator.
It does not change Docker socket ownership or permissions. Never run
the fixture supervisor on a shared or production host.

With the Phase 26 remote flags, add:

```text
--release-journal-anchor-state /operator-custody/release-head.json
```

Provision an existing operator-owned directory with mode `0700` outside
`--state-root`. Seed an operator-owned regular file with mode `0600`,
using your independently confirmed checkpoint, for example:

```json
{"version":1,"key_fingerprint":"<policy signer SHA-256>","sequence":1,"sha256":"<checkpoint SHA-256>"}
```

The operator locks a sibling file, checks the external and stored
anchors, and atomically advances the stored tip even when it observes
a revocation. Keep the directory outside preview registry backups. Loss,
wrong ownership, insecure permissions, or inconsistent data fails
closed. Recovery requires an independently verified current anchor,
not automatic recreation. A trusted operator/root that rolls back or
edits the custody directory is still within the trust boundary.

Inspect `phase27_linux_custody` and `phase27_durable_anchor` in the
operator proof artifact. The distinct builder UID seals input but does
not run BuildKit. The distinct verifier UID verifies the actual OCI
archive. Separate BuildKit, off-host signer/publisher custody and
bounded journal rotation are follow-ups.
