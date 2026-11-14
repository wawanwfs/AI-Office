# WFS AI Office — Phase 29 BuildKit acceptance

Run the `dynamic-preview-operator` workflow on a disposable Linux
amd64 GitHub-hosted runner. Its provisioning step verifies the pinned
BuildKit release checksum and installs distro RootlessKit, uidmap and
slirp4netns helpers. The supervisor creates an unprivileged builder with
a dedicated private Unix socket, state directory and subordinate ID map.
It does not modify the runtime Docker socket ACL or disable AppArmor.
Only the previously reviewed fixed preview template is built.

The sealed tar flows to the builder's Buildx client on stdin. Buildx
uses the dedicated remote driver and exports OCI to stdout without
loading Docker. A distinct UID verifies the same archive before
synthetic signing. The original operator then uses the Phase 24–28
admission and policy checks. The separate Phase 19 regression still uses
its historical disposable Docker build probe. It does not produce the
artifact promoted in Phase 29.

Look for `phase29_rootless_buildkit`, `phase24_oci_runtime`,
`phase28_journal_rotation` and `cleanup_confirmed` in the
`phase6-operator-preview-manager` artifact. Missing daemon, unverified
descriptor, inaccessible Docker checks, or failed OCI verification stop
acceptance. The fixture stops its daemon and removes its ephemeral
account. Never run the supervisor on a shared or production host.
This gate does not certify an independently administered build host,
network policy, arbitrary builds or offline dependency closure.

References: [BuildKit rootless mode](https://github.com/moby/buildkit/blob/v0.35.0/docs/rootless.md)
and [Buildx remote driver](https://docs.docker.com/build/builders/drivers/remote/).
