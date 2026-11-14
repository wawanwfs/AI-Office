"""Bounded lease tests without Docker, using the real clock and registry reader."""
from contextlib import closing
import sqlite3
from types import SimpleNamespace
import time

import pytest

import preview_release_lease as lease
from preview_admission_v2 import AdmissionDenied
from preview_proxy import PreviewProxyUnavailable, PreviewRegistryReader


@pytest.fixture
def registered(tmp_path):
    registry = tmp_path / "registry.db"
    with closing(sqlite3.connect(registry, isolation_level=None)) as db:
        db.executescript("""
            CREATE TABLE wfs_preview_instances(
              project_id TEXT PRIMARY KEY, port INTEGER, phase TEXT, compose_name TEXT,
              api_container_id TEXT, oci_approval_sha256 TEXT, lease_deadline REAL,
              lease_suspended INTEGER DEFAULT 0);
        """)
        db.execute("INSERT INTO wfs_preview_instances VALUES(?,?,?,?,?,?,?,0)",
                   ("tenant-a", 19010, "running", "test-project", "1"*64, "2"*64, None))
        db.row_factory = sqlite3.Row
        record = dict(db.execute("SELECT * FROM wfs_preview_instances").fetchone())
    return SimpleNamespace(_db=lambda: sqlite3.connect(registry, isolation_level=None),
                           _compose_name=lambda _: "test-project", registry=registry), record


@pytest.mark.parametrize("mode", ["revoked", "expired", "stalled", "expired-after-restart"])
def test_watch_suspends_without_extending_the_deadline(registered, monkeypatch, mode):
    manager, record = registered
    stopped = []
    expiry = time.time() + .12
    monkeypatch.setattr(lease, "LEASE_SECONDS", .24)
    monkeypatch.setattr(lease, "POLL_SECONDS", .025)
    monkeypatch.setattr(lease, "_suspend", lambda _, state: stopped.append(state.copy()))
    if mode == "expired-after-restart":
        record["lease_deadline"] = time.time() - 1

    def signed_expiry(*_):
        if mode == "revoked":
            raise AdmissionDenied("revoked")
        if mode == "stalled":
            time.sleep(.7)
        if mode == "expired-after-restart":
            pytest.fail("a restarted watch must not renew an expired lease")
        return expiry

    monkeypatch.setattr(lease, "_signed_expiry", signed_expiry)
    began = time.monotonic()
    assert lease._watch(manager, record) == ("release-check-denied" if mode == "revoked" else "lease-expired")
    assert time.monotonic() - began < .65
    assert len(stopped) == 1
    if mode == "expired":
        assert 0 < stopped[0]["lease_deadline"] <= expiry
    if mode != "expired-after-restart":
        with pytest.raises(PreviewProxyUnavailable):
            PreviewRegistryReader(manager.registry).port("tenant-a")


def test_suspend_checks_project_and_api_id_and_only_stops_api_ingress(registered, monkeypatch):
    manager, record = registered
    commands = []
    running = True

    def docker(_, *args):
        nonlocal running
        commands.append(args)
        if args[:2] == ("container", "stop"):
            assert args == ("container", "stop", "--time", "3", "3"*64, "1"*64)
            running = False
            return ""
        assert "label=com.docker.compose.project=test-project" in args
        if "--all" not in args and not running:
            return ""
        return ("1" if args[-1].endswith("=api") else "3") * 64 + "\n"

    monkeypatch.setattr(lease, "_docker", docker)
    lease._suspend(manager, record)
    with closing(manager._db()) as db:
        assert db.execute("SELECT phase,lease_suspended,lease_deadline "
                          "FROM wfs_preview_instances").fetchone() == ("stopped", 1, 0)
    assert not any({"rm", "down", "volume", "db"} & set(cmd) for cmd in commands)
    with pytest.raises(AdmissionDenied, match="changed before suspension"):
        lease._suspend(manager, record)
