# Durable Master Queue — Phase 2 core

This is a **production-oriented queue core**, not a claim that production
workers have been migrated. File: `backend/master_queue.py`.

## Guarantees tested

- SQLite WAL-compatible transaction/atomic claim (`BEGIN IMMEDIATE`).
- Task idempotence per `(project_id, task_id)` and priority ordering.
- Global and per-project concurrency admission limits.
- Per-worker lease tokens, heartbeat, and stale-write rejection.
- Exponential retry delays, terminal failure, and crashed-lease recovery.
- Explicit persistent paused state, **paused by default**.
- Cooperative cancellation: `cancel()` raises a flag. It does NOT kill a
  running Docker process or a paid LLM call.
- Read-only listing and aggregate metrics, without private lease tokens.

## Wire to the actual executor (not yet performed)

A production worker loop must:

1. Confirm operator/RBAC permissions and that `project_launch` approval exists.
2. `claim(worker_id)` and immediately recheck approval and task pause.
3. Dispatch the corresponding real task through existing
   `backend_live/wfs_tasks.py` / sandbox adapters, without shared workspace
   writes; periodically heartbeat and check `cancel_requested()`.
4. `finish(..., success=...) ` with actual QA output, never a simulated pass.
5. Distinguish lost worker / TTL from Docker task still running to prevent
   duplicate side effects. Add worker fencing at the external executor layer,
   idempotent artifacts, and a reconciliation supervisor before enabling live
   dispatch.
6. Add API endpoints behind existing auth, rate limits, and audit logs, plus
   a dashboard view explicitly labeled `queue` (not `running agent`).
7. Integrate budget approvals before token-consuming calls.

This ledger is intended as an **additive migration**. It does not replace the
existing working task engine or change current production database tables.

Testing:

```sh
python -m pytest backend/test_master_queue.py -q
```

Avoid running queue workers on a public host with `--network host` and an
unrestricted Docker socket. Document and test kill/rollback semantics first.
