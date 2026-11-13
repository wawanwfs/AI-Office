"""Real TLS, chain verification, freshness, replay and source-failure checks."""
from dataclasses import replace
from http.client import HTTPSConnection
from pathlib import Path
import ssl
import sys
import time

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from ci_phase26_release_journal import JournalFixture
from preview_admission_v2 import AdmissionDenied
from preview_release_journal import ROUTE

MANIFEST = "sha256:" + "a" * 64
APPROVAL = "b" * 64
EXPECTED = dict(manifest_digest=MANIFEST, approval_sha256=APPROVAL,
                reviewer_fingerprint="c" * 64, release_witness_fingerprint="d" * 64)


@pytest.fixture
def journal(tmp_path):
    return JournalFixture(tmp_path / "journal", MANIFEST, APPROVAL)


def test_mtls_pins_both_peers_and_denies_offline_fallback(journal):
    journal.append()
    with journal.server() as port:
        policy = journal.policy(port, 1)
        assert policy.verify(**EXPECTED) == 1
        with pytest.raises(AdmissionDenied, match="certificate pin mismatch"):
            replace(policy.tls, server_fingerprint="0" * 64).fetch()
        with pytest.raises(AdmissionDenied, match="response rejected"):
            journal.endpoint(port, role="unapproved-client").fetch()
        ctx = ssl.create_default_context(cafile=str(journal.root / "ca.pem"))
        conn = HTTPSConnection("127.0.0.1", port, context=ctx, timeout=3)
        try:
            with pytest.raises(OSError):
                conn.request("GET", ROUTE)
                conn.getresponse()
        finally:
            conn.close()
    with pytest.raises(AdmissionDenied, match="HTTPS source unavailable"):
        policy.verify(**EXPECTED)


def test_revocation_then_replay_after_publisher_restart(journal):
    journal.append()
    old = list(journal.entries)
    with journal.server() as port:
        policy = journal.policy(port, 1)
        assert policy.verify(**EXPECTED) == 1
        journal.append("revoke")
        with pytest.raises(AdmissionDenied, match="explicitly revoked"):
            policy.verify(**EXPECTED)
        journal.publish(old)
        with pytest.raises(AdmissionDenied, match="response rejected"):
            policy.verify(**EXPECTED)
    with journal.server() as port:
        with pytest.raises(AdmissionDenied, match="rollback or fork"):
            journal.policy(port, 2).verify(**EXPECTED)
        journal.publish(journal.entries)
        journal.append()
        assert journal.policy(port, 2).verify(**EXPECTED) == 3


def test_stale_and_future_checkpoints_denied(journal):
    now = int(time.time())
    journal.append(now=now - 541)
    with journal.server() as port:
        policy = journal.policy(port, 1)
        with pytest.raises(AdmissionDenied, match="expired or clock"):
            policy.verify(**EXPECTED, now=now)
        journal.append(now=now + 31)
        with pytest.raises(AdmissionDenied, match="expired or clock"):
            policy.verify(**EXPECTED, now=now)
        assert policy.verify(**EXPECTED, now=now + 1) == 2


def test_broken_chain_and_wrong_release_denied(journal):
    journal.append()
    journal.append()
    journal.publish([journal.entries[-1]])
    with journal.server() as port:
        policy = journal.policy(port, 1)
        with pytest.raises(AdmissionDenied, match="response rejected"):
            policy.verify(**EXPECTED)
        journal.publish(journal.entries)
        with pytest.raises(AdmissionDenied, match="does not match OCI"):
            policy.verify(**{**EXPECTED, "approval_sha256": "0" * 64})


def test_independent_anchor_rejects_signed_alternate_history(journal):
    journal.append()
    original = journal.hashes[0]
    journal.entries.clear()
    journal.hashes.clear()
    journal.append("revoke")
    assert journal.hashes[0] != original
    with journal.server() as port:
        from preview_release_journal import RemoteReleasePolicy
        policy = RemoteReleasePolicy(journal.endpoint(port), journal.policy_key,
                                     journal.fingerprint, 1, original)
        with pytest.raises(AdmissionDenied, match="rollback or fork"):
            policy.verify(**EXPECTED)


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="Linux anchor custody")
def test_durable_tip_denies_replay_after_both_processes_reopen(journal, tmp_path):
    import json
    from preview_release_journal import RemoteReleasePolicy

    journal.append()
    old = list(journal.entries)
    folder = tmp_path / "custody"
    folder.mkdir(mode=0o700)
    anchor = folder / "anchor.json"
    anchor.write_text(json.dumps({"version": 1, "sequence": 1,
                                  "key_fingerprint": journal.fingerprint,
                                  "sha256": journal.hashes[0]}))
    anchor.chmod(0o600)

    def open_policy(port):
        return RemoteReleasePolicy(journal.endpoint(port), journal.policy_key,
                                   journal.fingerprint, 1, journal.hashes[0],
                                   custody_path=anchor)

    with journal.server() as port:
        assert open_policy(port).verify(**EXPECTED) == 1
        journal.append("revoke")
        with pytest.raises(AdmissionDenied, match="explicitly revoked"):
            open_policy(port).verify(**EXPECTED)
        assert json.loads(anchor.read_text())["sequence"] == 2
    journal.publish(old)
    with journal.server() as port:
        with pytest.raises(AdmissionDenied, match="rollback or fork"):
            open_policy(port).verify(**EXPECTED)
        journal.publish(journal.entries)
        journal.append()
        assert open_policy(port).verify(**EXPECTED) == 3
        anchor.chmod(0o644)
        with pytest.raises(AdmissionDenied, match="0600 regular file"):
            open_policy(port).verify(**EXPECTED)
        anchor.unlink()
        with pytest.raises(AdmissionDenied, match="anchor unavailable"):
            open_policy(port).verify(**EXPECTED)
        assert not anchor.exists()
