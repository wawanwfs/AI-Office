"""Operator-only bounded watch for one signed, disposable preview instance."""
from contextlib import closing
from multiprocessing import get_context
from pathlib import Path
from queue import Empty, Queue
import os
import re
import subprocess
from threading import Thread
import time

from preview_admission_v2 import AdmissionDenied
from preview_boot_identity import current_boot_id, lease_matches_boot
from preview_oci_approval import verify_release_approval
from preview_oci_layout import sha256
from preview_release_journal import RemoteReleasePolicy
from preview_sealed_build import fcntl, linux_sealing_supported
from preview_sealed_runtime import _docker_env
from preview_signature import canonical_review_bytes
from project_rbac import ident

LEASE_SECONDS = 15
POLL_SECONDS = 2
_CONTAINER_ID = re.compile(r"[a-f0-9]{64}\Z")


def _signed_expiry(manager, record):
    release = manager.oci_release
    reviewer = manager._verify()["fingerprint"]
    approval, _, _ = verify_release_approval(
        approval_path=release.approval_path, signature_path=release.signature_path,
        witness_key_path=release.witness_key_path,
        trusted_approval_sha256=release.approval_sha256,
        trusted_witness_fingerprint=release.witness_fingerprint,
        trusted_reviewer_fingerprint=reviewer,
        trusted_review_sha256=sha256(canonical_review_bytes(manager.reviewed_manifest)),
        review_manifest=manager.reviewed_manifest)
    if (approval["manifest_digest"] != record["oci_manifest_digest"]
            or release.approval_sha256 != record["oci_approval_sha256"]):
        raise AdmissionDenied("running preview release differs from lease")
    checkpoint = manager.release_policy.verify_checkpoint(
        manifest_digest=approval["manifest_digest"],
        approval_sha256=release.approval_sha256, reviewer_fingerprint=reviewer,
        release_witness_fingerprint=release.witness_fingerprint)
    return min(approval["expires_at"], checkpoint["expires_at"])


def _write_deadline(manager, record, deadline):
    boot_id = current_boot_id()
    if boot_id is None:
        raise AdmissionDenied("Linux boot identity unavailable for lease")
    with closing(manager._db()) as db:
        updated = db.execute(
            "UPDATE wfs_preview_instances SET lease_deadline=?,lease_boot_id=? "
            "WHERE project_id=? AND phase='running' AND api_container_id=? "
            "AND oci_approval_sha256=? AND lease_deadline IS ? AND lease_boot_id IS ?",
            (deadline, boot_id, record["project_id"], record["api_container_id"],
             record["oci_approval_sha256"], record["lease_deadline"],
             record["lease_boot_id"])).rowcount
    if updated == 1:
        record.update(lease_deadline=deadline, lease_boot_id=boot_id)
    return updated == 1


def _docker(manager, *args):
    return subprocess.run([manager.docker, *args], env=_docker_env(),
                          check=True, timeout=15, capture_output=True, text=True).stdout


def _suspend(manager, record):
    project = record["project_id"]
    compose = manager._compose_name(project)
    if compose != record["compose_name"]:
        raise AdmissionDenied("invalid registered Compose project")
    if record["phase"] == "running":
        with closing(manager._db()) as db:
            claimed = db.execute(
                "UPDATE wfs_preview_instances SET phase='uncertain',lease_deadline=0,lease_suspended=1 "
                "WHERE project_id=? AND phase='running' AND api_container_id=? "
                "AND oci_approval_sha256=? AND lease_deadline IS ? AND lease_boot_id IS ?",
                (project, record["api_container_id"], record["oci_approval_sha256"],
                 record["lease_deadline"], record["lease_boot_id"])).rowcount
        if claimed != 1:
            raise AdmissionDenied("preview changed before suspension; reconcile")
    elif not (record["phase"] == "uncertain" and record["lease_suspended"]
              and record["lease_deadline"] == 0):
        raise AdmissionDenied("no pending lease suspension to reconcile")
    # Exact project and service labels, no mutable Compose files, token,
    # release approval, volume command, or broad daemon-wide stop.
    def containers(service, include_stopped):
        ids = _docker(manager, "container", "ls", *(("--all",) if include_stopped else ()),
                      "--no-trunc", "--quiet", "--filter", f"label=com.docker.compose.project={compose}",
                      "--filter", f"label=com.docker.compose.service={service}").splitlines()
        if len(ids) > 1 or any(not _CONTAINER_ID.fullmatch(i) for i in ids):
            raise AdmissionDenied("ambiguous leased preview containers")
        return ids

    ingress, api = containers("ingress", True), containers("api", True)
    if api != [record["api_container_id"]] or not ingress:
        raise AdmissionDenied("registered leased containers missing or changed")
    _docker(manager, "container", "stop", "--time", "3", *ingress, *api)
    if containers("ingress", False) or containers("api", False):
        raise AdmissionDenied("preview suspension not confirmed")
    with closing(manager._db()) as db:
        updated = db.execute(
            "UPDATE wfs_preview_instances SET phase='stopped' WHERE project_id=? "
            "AND api_container_id=? AND phase='uncertain' AND lease_suspended=1",
            (project, record["api_container_id"])).rowcount
    if updated != 1:
        raise AdmissionDenied("preview changed during suspension; reconcile")


def _watch(manager, record, *, startup=False):
    wall, steady = time.time(), time.monotonic()
    old = None if startup and record["lease_deadline"] == 0 else record["lease_deadline"]
    # A new watch closes gateway reads until the first authenticated check.
    # A replacement watch cannot renew an already expired persisted lease.
    if old is None and not startup:
        if not _write_deadline(manager, record, 0):
            raise AdmissionDenied("preview changed before lease watch")
    elif old is not None:
        if old <= wall or not lease_matches_boot(record["lease_boot_id"]):
            _suspend(manager, record)
            return "lease-expired" if old <= wall else "lease-boot-changed"
    deadline = steady + min(LEASE_SECONDS, old - wall if old is not None else LEASE_SECONDS)
    next_check = steady
    signed_deadline = None
    result = Queue(maxsize=1)
    pending = False

    def check():
        try:
            result.put(_signed_expiry(manager, record))
        except Exception as exc:
            result.put(exc)

    reason = "lease-expired"
    while (now := time.monotonic()) < deadline:
        if signed_deadline is not None and time.time() >= signed_deadline:
            break
        if not pending and now >= next_check:
            started = now
            Thread(target=check, daemon=True).start()
            pending = True
        if not pending:
            time.sleep(min(0.2, max(0, min(deadline, next_check) - now)))
            continue
        try:
            expires = result.get(timeout=min(0.2, max(0, deadline - now)))
        except Empty:
            continue
        pending = False
        now, wall = time.monotonic(), time.time()
        if isinstance(expires, Exception):
            reason = "release-check-denied"
            break
        if now >= deadline or expires <= wall:
            break
        # Delay in a request cannot mint a fresh full lease on arrival.
        deadline = min(started + LEASE_SECONDS, now + expires - wall)
        if deadline <= now:
            break
        persisted = min(expires, wall + deadline - now)
        if not _write_deadline(manager, record, persisted):
            raise AdmissionDenied("preview changed during lease renewal")
        signed_deadline = expires
        next_check = now + POLL_SECONDS
    _suspend(manager, record)
    return reason


def _require_durable(manager):
    if (not manager.sealed_runtime or not linux_sealing_supported()
            or manager.oci_release is None
            or not isinstance(manager.release_policy, RemoteReleasePolicy)
            or not manager.release_policy.durable_custody_enabled):
        raise AdmissionDenied("lease watch requires sealed OCI and a durable mTLS journal")


def watch_preview_release(manager, project, *, _startup=False, _recover=False, _stop=False):
    """Run in the foreground under the trusted Docker operator until suspension."""
    _require_durable(manager)
    project = ident(project)
    lock = Path(manager.registry.parent) / (manager._compose_name(project) + ".lease-lock")
    with os.fdopen(os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), "r+b") as fd:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise AdmissionDenied("preview lease watch is already active") from exc
        record = manager.status(project)
        if record["phase"] == "stopped" and record["lease_suspended"]:
            return "already-suspended"
        if not _CONTAINER_ID.fullmatch(record["api_container_id"] or ""):
            raise AdmissionDenied("lease watch requires a registered OCI preview")
        if record["phase"] == "uncertain" and record["lease_suspended"]:
            _suspend(manager, record)
            return "suspension-reconciled"
        if record["phase"] != "running":
            raise AdmissionDenied("lease watch requires a running registered OCI preview")
        if _recover and record["lease_deadline"] is None:
            raise AdmissionDenied("no supervised lease to recover")
        if _stop:
            _suspend(manager, record)
            return "worker-retries-exhausted"
        return _watch(manager, record, startup=_startup)


def _watch_worker(manager, project, startup):
    watch_preview_release(manager, project, _startup=startup, _recover=True)


def supervise_preview_release(manager, project, port, token, *, on_worker=None):
    """Start with gateway admission closed, then supervise a replaceable Linux worker.

    Call only from a single-threaded foreground operator. A worker exit cannot
    recreate a bootstrap lease. A stopped preview is never started again here.
    """
    _require_durable(manager)
    manager.start(project, port, token, supervised=True)
    return recover_preview_supervision(manager, project, on_worker=on_worker, _startup=True)


def recover_preview_supervision(manager, project, *, on_worker=None, _startup=False):
    """Attach supervision without starting containers or recreating an expired lease."""
    _require_durable(manager)
    ctx = get_context("fork")
    for attempt in range(4):
        worker = ctx.Process(target=_watch_worker, args=(manager, project, _startup and attempt == 0))
        worker.start()
        try:
            if on_worker is not None:
                on_worker(worker.pid)
            worker.join()
            if worker.exitcode == 0:
                return manager.status(project)
        finally:
            if worker.is_alive():
                worker.kill()
                worker.join()
            worker.close()
    # Keep gateway fail-closed and attempt the same tenant-scoped stop.
    watch_preview_release(manager, project, _recover=True, _stop=True)
    return manager.status(project)
