# WFS AI Office — Phase 30 release lease

Start a reviewed preview with the existing operator workflow. On the
same Linux Docker operator host, run `scripts/wfs_operator_preview.py
watch-release` in the foreground with the same project, state root,
reviewer, OCI approval, and mTLS flags. Include `--approved` and the
independently provisioned `--release-journal-anchor-state`. The watch
does not need a tenant token. Run one watch per tenant under a service
supervisor. It is not started automatically by `start`.

The watch checks every two seconds after a successful poll. It never
extends beyond 15 seconds from the start of that check or beyond the
earlier of the signed OCI approval and journal expiries. A denial ends
the watch and suspends ingress and API. A stalled check cannot extend the
current lease. Gateway reads fail closed at the recorded expiry even
when the watch is absent. Direct loopback shutdown requires a running
watch and a responsive Docker daemon. This is not a hardened host-clock
or operator-account boundary.

The watch stops existing containers, never calls `down` or deletes
volumes, and leaves the existing PostgreSQL container and its tmpfs
untouched. Its data is disposable and will not survive PostgreSQL
termination. An expired persisted lease is not renewed by restarting
the watcher. A suspended preview does not resume automatically. To
resume, provision current signed approvals and issue a new operator
`start`, then start the watch again. In-place `restart` is denied
while a lease is recorded. If the watch reports an uncertain Docker
outcome, inspect the exact Compose project and reconcile before restarting.
Authorized disposable cleanup still requires `stop --discard-data`.

Inspect `phase30_release_lease` in the dynamic preview artifact. No
separate custody host or production enforcement is implied.
