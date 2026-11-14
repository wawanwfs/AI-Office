# WFS AI Office — Phase 31 supervised preview lease

Use `scripts/wfs_operator_preview.py start-supervised` with the same
operator flags and token as `start`, plus the complete mTLS journal and
independently provisioned durable anchor. Run it in the foreground as
the trusted Linux Docker operator. It starts the preview with gateway
admission closed and starts a separate worker. After successful signed
verification, the worker renews the Phase 30 bounded lease.

The foreground supervisor replaces an unexpectedly exited worker up to
three times. A replacement can only renew an existing unexpired lease
after another signed check. A missed bootstrap or elapsed lease causes
non-destructive suspension. An interrupted policy stop can be reconciled
without issuing a new start. The supervisor returns when the preview is
suspended and never automatically starts it again.

If the foreground supervisor itself exits, an operator or external
service supervisor can run `recover-supervised` with the same state and
trust flags, without `--port` or a preview token. It attaches only to a
recorded lease or finishes a pending suspension. Do not automatically
rerun `start-supervised` after failure. The legacy `start` and
`watch-release` commands remain available.

During the gap between a worker exit and recovery, gateway requests
cannot use an elapsed lease. Direct loopback may remain available until
an active operator can confirm Docker suspension. A failed Docker
operation is not a confirmed stop. PostgreSQL and volumes are left
alone. Explicit `stop --discard-data` remains the cleanup path.

Inspect `phase31_supervised_lease` in the CI runtime artifact.
