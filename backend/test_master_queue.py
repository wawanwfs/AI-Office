"""Deterministic queue tests: no network, Docker, LLM or production database."""
from concurrent.futures import ThreadPoolExecutor
import pytest
from master_queue import DurableMasterQueue


@pytest.fixture
def setup(tmp_path):
    now = [1000.0]
    def new(**kw):
        return DurableMasterQueue(tmp_path / "queue.db", clock=lambda: now[0], **kw)
    return new, now


def test_fail_closed_resume_is_explicit_and_persistent(setup):
    new, _ = setup
    q = new()
    jid = q.submit("p1", "t1", "backend")
    assert q.is_paused() is True
    assert q.claim("worker-1") is None
    q.set_paused(False)
    assert new().is_paused() is False
    a = new().claim("worker-1")
    assert a["id"] == jid


def test_idempotence_and_role_conflict(setup):
    new, _ = setup
    q = new()
    jid = q.submit("p1", "t1", "backend")
    assert q.submit("p1", "t1", "backend") == jid
    assert q.submit("p2", "t1", "backend") != jid
    with pytest.raises(ValueError, match="another role"):
        q.submit("p1", "t1", "frontend")
    assert len(q.list()) == 2


def test_global_and_per_project_admission_limits(setup):
    new, _ = setup
    q = new(max_running=2, max_per_project=1)
    q.set_paused(False)
    q.submit("a", "a1", "backend", priority=9)
    q.submit("a", "a2", "frontend", priority=8)
    q.submit("b", "b1", "backend", priority=7)
    q.submit("c", "c1", "qa", priority=0)
    one = q.claim("w1")
    two = new(max_running=2, max_per_project=1).claim("w2")
    assert (one["project_id"], two["project_id"]) == ("a", "b")
    assert q.claim("w3") is None
    assert q.finish(one["id"], "w1", one["lease_token"], success=True) == "completed"
    assert q.claim("w3")["project_id"] == "a"


def test_retry_backoff_and_terminal_failure(setup):
    new, now = setup
    q = new()
    q.submit("a", "t1", "backend", max_attempts=2)
    q.set_paused(False)
    a = q.claim("worker")
    assert q.finish(a["id"], "worker", a["lease_token"], success=False, error="test failed") == "queued"
    assert q.claim("worker") is None
    now[0] += 5
    b = q.claim("worker")
    assert b["attempt"] == 2
    assert q.finish(b["id"], "worker", b["lease_token"], success=False) == "failed"
    assert q.claim("worker") is None


def test_expired_lease_recovery_does_not_accept_old_result(setup):
    new, now = setup
    q = new()
    jid = q.submit("a", "t1", "qa")
    q.set_paused(False)
    old = q.claim("worker-one", lease_seconds=10)
    now[0] += 11
    assert new().recover_expired() == 1
    nxt = q.claim("worker-two")
    assert nxt["id"] == jid
    assert q.finish(jid, "worker-one", old["lease_token"], success=True) is None
    assert q.finish(jid, "worker-two", nxt["lease_token"], success=True) == "completed"


def test_last_attempt_crash_is_failed_not_infinite_retry(setup):
    new, now = setup
    q = new()
    jid = q.submit("a", "t", "qa", max_attempts=1)
    q.set_paused(False)
    q.claim("w", lease_seconds=10)
    now[0] += 11
    assert q.recover_expired() == 1
    assert q.get(jid)["status"] == "failed"


def test_cancel_is_cooperative_and_durable(setup):
    new, _ = setup
    q = new()
    jid = q.submit("p", "t", "qa")
    assert q.cancel(jid) is True
    assert q.get(jid)["status"] == "cancelled"
    other = q.submit("p", "other", "backend")
    q.set_paused(False)
    cl = q.claim("w")
    assert cl["id"] == other
    assert q.cancel(other) is True
    assert q.cancel_requested(other, "w", cl["lease_token"]) is True
    assert q.heartbeat(other, "w", cl["lease_token"]) is False
    assert q.finish(other, "w", cl["lease_token"], success=True) == "cancelled"


def test_stale_or_wrong_worker_cannot_write_status(setup):
    new, _ = setup
    q = new()
    jid = q.submit("p", "t", "qa")
    q.set_paused(False)
    a = q.claim("w")
    assert not q.heartbeat(jid, "wrong", a["lease_token"])
    assert q.finish(jid, "wrong", a["lease_token"], success=True) is None
    assert q.get(jid)["status"] == "leased"
    assert "lease_token" not in q.get(jid)
    assert all("lease_token" not in x for x in q.list())


def test_two_workers_cannot_claim_same_job(setup):
    new, _ = setup
    q = new()
    jid = q.submit("p", "t", "qa")
    q.set_paused(False)
    with ThreadPoolExecutor(max_workers=8) as pool:
        claims = list(pool.map(lambda i: new().claim(f"worker-{i}"), range(8)))
    actual = [x for x in claims if x]
    assert len(actual) == 1
    assert actual[0]["id"] == jid


@pytest.mark.parametrize("bad", ["../escape", "a/b", "", "!", "spaces in id"])
def test_invalid_ids_never_enter_queue(setup, bad):
    new, _ = setup
    with pytest.raises(ValueError):
        new().submit(bad, "good", "backend")


def test_metrics_are_real_db_counts(setup):
    new, _ = setup
    q = new()
    q.submit("p", "t1", "backend")
    q.submit("p", "t2", "qa")
    assert q.metrics() == {"cancelled": 0, "completed": 0, "failed": 0,
                           "leased": 0, "queued": 2}


def test_quarantine_expired_lease_requires_manual_reconciliation(setup):
    new, now = setup
    q = new()
    job = q.submit("p", "task", "backend")
    q.set_paused(False)
    claim = q.claim("worker", lease_seconds=10, recover_policy="quarantine")
    now[0] += 11
    assert new().claim("new-worker", recover_policy="quarantine") is None
    assert q.get(job)["status"] == "failed"
    assert "reconciliation" in q.get(job)["last_error"]
    assert q.finish(job,"worker",claim["lease_token"],success=True) is None


def test_fencing_and_append_only_actual_execution_events(setup):
    new, _ = setup
    q = new()
    job = q.submit("proj", "task", "qa")
    q.set_paused(False)
    claim = q.claim("worker", recover_policy="quarantine")
    token = claim["lease_token"]
    assert q.verify_lease(job,"worker",token)
    assert not q.record_phase(job,"attacker",token,"executing")
    assert q.record_phase(job,"worker",token,"executing","real task started")
    assert q.record_phase(job,"worker",token,"reviewing","LLM QA pending")
    assert q.finish(job,"worker",token,success=True) == "completed"
    assert not q.verify_lease(job,"worker",token)
    phases = [x["phase"] for x in q.events("proj")]
    assert phases == ["completed","reviewing","executing","leased","queued"]
    with pytest.raises(ValueError):
        q.record_phase(job,"worker",token,"simulated")
