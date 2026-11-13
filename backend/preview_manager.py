"""Operator-only, template-locked Docker Compose preview lifecycle (Phase 6).

This is a dynamic *disposable reference template* manager, not a generic
source builder or public authenticated reverse proxy. It must run on a
separate operator/worker host with Docker rights; the HTTP gateway NEVER
imports or exposes this module. No client/LLM controls flags/images/volumes.
"""
from contextlib import closing
import copy
import hashlib
import os
from pathlib import Path
import sqlite3
import subprocess

from project_rbac import ident
from preview_admission import ReviewedPreviewAdmission, AdmissionDenied
from preview_authority import SignedPreviewAuthority
from preview_snapshot import ReviewedPreviewSnapshot
from preview_oci_promotion import (
    ApprovedOCIRelease, load_verified_image, verify_api_container, verify_engine_image,
)
from preview_sealed_build import linux_sealing_supported
from preview_sealed_runtime import (
    SealedRuntimeCompose,
    build_local_reviewed_ingress_image,
    derive_image_only_compose, ensure_approved_runtime_images,
    verify_local_image_exists,
)


class PreviewDenied(PermissionError):
    pass


class TemplatePreviewManager:
    def __init__(self, registry_path, template_path, *, enabled=False,
                 runner=None, docker="docker", reviewed_files=None,
                 reviewer_authority=None, sealed_runtime=None, oci_release=None):
        if not enabled:
            raise PreviewDenied("operator approval required for Docker preview")
        template=Path(template_path).absolute()
        if (template.is_symlink() or not template.is_file() or
            template.resolve()!=template or template.name!="compose.yaml" or
            "examples/fullstack-preview" not in template.as_posix()):
            raise PreviewDenied("unreviewed or symlinked preview template denied")
        # An approved digest mapping alone is not authorization. Every
        # programmatic caller (including CI) must supply a signed, independently
        # pinned reviewer authority. A candidate self-signature is NOT an
        # independent operator approval.
        if not isinstance(reviewer_authority, SignedPreviewAuthority):
            raise AdmissionDenied("signed reviewer authority required by preview manager")
        self.authority=reviewer_authority
        self.reviewed_manifest=copy.deepcopy(reviewed_files)
        self.authority.verify(self.reviewed_manifest)
        self.admission=ReviewedPreviewAdmission(template.parent,self.reviewed_manifest)
        self.template=template
        self.registry=Path(registry_path).absolute()
        if not self.registry.parent.is_dir() or self.registry.is_symlink():
            raise PreviewDenied("private registry parent is not provisioned")
        self.docker=docker
        # A real operator (default subprocess runner) MUST use the Linux
        # kernel-sealed image-only lifecycle. Injected test runners keep
        # legacy fixture behavior unless they explicitly enable the
        # hardened real Docker pathway (as the operator CI does).
        if sealed_runtime is False and runner is None:
            raise AdmissionDenied("real Docker operator cannot disable sealed runtime")
        self.sealed_runtime = (runner is None if sealed_runtime is None
                               else sealed_runtime is True)
        if oci_release is not None and not isinstance(oci_release, ApprovedOCIRelease):
            raise AdmissionDenied("invalid approved OCI release configuration")
        self.oci_release = oci_release
        self.runner=runner or subprocess.run
        self.snapshots=ReviewedPreviewSnapshot(
            template.parent, self.registry.parent, self.reviewed_manifest)
        with closing(self._db()) as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS wfs_preview_instances(
                  project_id TEXT PRIMARY KEY,
                  port INTEGER NOT NULL UNIQUE CHECK(port BETWEEN 19000 AND 22000),
                  phase TEXT NOT NULL CHECK(phase IN
                    ('reserved','running','stopped','uncertain')),
                  compose_name TEXT NOT NULL UNIQUE
                );
                CREATE TABLE IF NOT EXISTS wfs_preview_reviewer_epoch(
                  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
                  epoch INTEGER NOT NULL CHECK(epoch BETWEEN 1 AND 4611686018427387904),
                  policy_sha256 TEXT NOT NULL
                );
            """)
            # Append-only additive migration for legacy disposable registry:
            # prior rows have no pinned image and cannot be run in sealed
            # mode until an authorized fresh start builds one.
            columns = {row["name"] for row in
                       db.execute("PRAGMA table_info(wfs_preview_instances)")}
            if "api_image_id" not in columns:
                db.execute("ALTER TABLE wfs_preview_instances ADD COLUMN api_image_id TEXT")
            if "ingress_image_id" not in columns:
                db.execute("ALTER TABLE wfs_preview_instances ADD COLUMN ingress_image_id TEXT")
            if "api_frontend_sealed" not in columns:
                db.execute(
                    "ALTER TABLE wfs_preview_instances ADD COLUMN "
                    "api_frontend_sealed INTEGER NOT NULL DEFAULT 0")
            if "oci_manifest_digest" not in columns:
                db.execute("ALTER TABLE wfs_preview_instances ADD COLUMN oci_manifest_digest TEXT")
            if "oci_config_digest" not in columns:
                db.execute("ALTER TABLE wfs_preview_instances ADD COLUMN oci_config_digest TEXT")
            if "oci_approval_sha256" not in columns:
                db.execute("ALTER TABLE wfs_preview_instances ADD COLUMN oci_approval_sha256 TEXT")
            if "api_container_id" not in columns:
                db.execute("ALTER TABLE wfs_preview_instances ADD COLUMN api_container_id TEXT")
        self._enforce_epoch(self.authority.verify(self.reviewed_manifest))

    def _enforce_epoch(self, decision):
        """Local crash-durable epoch floor and equal-epoch policy pin.

        Protection assumes an operator-owned SQLite registry that an
        attacker cannot delete, restore, replace or modify directly.
        It does not provide a remote transparency log / hardware counter.
        """
        epoch=decision["epoch"]
        policy_sha=self.authority.trusted_policy_sha256
        if type(epoch) is not int or not 1 <= epoch <= 4611686018427387904:
            raise AdmissionDenied("reviewer epoch outside SQLite bounds")
        with closing(self._db()) as db:
            try:
                db.execute("BEGIN IMMEDIATE")
                previous=db.execute(
                    "SELECT epoch,policy_sha256 FROM wfs_preview_reviewer_epoch "
                    "WHERE singleton=1"
                ).fetchone()
                if previous is not None:
                    if epoch < previous["epoch"]:
                        raise AdmissionDenied("reviewer policy epoch rollback denied")
                    if (epoch == previous["epoch"] and
                            policy_sha != previous["policy_sha256"]):
                        raise AdmissionDenied("reviewer policy changed at same epoch")
                if previous is None:
                    db.execute(
                        "INSERT INTO wfs_preview_reviewer_epoch VALUES(1,?,?)",
                        (epoch,policy_sha))
                elif epoch > previous["epoch"]:
                    db.execute(
                        "UPDATE wfs_preview_reviewer_epoch SET epoch=?,policy_sha256=? "
                        "WHERE singleton=1", (epoch,policy_sha))
                db.commit()
            except BaseException:
                db.rollback()
                raise

    def _verify(self):
        """Fail closed for revoked/policy-changed approvals and altered bytes."""
        decision=self.authority.verify(self.reviewed_manifest)
        self.admission.verify()
        self._enforce_epoch(decision)
        return decision

    def _approved_release(self):
        if not linux_sealing_supported():
            raise AdmissionDenied("sealed preview operator requires Linux memfd")
        if self.oci_release is None:
            raise AdmissionDenied("current pinned OCI release approval required")
        decision = self._verify()
        return self.oci_release.open_verified(self.reviewed_manifest, decision["fingerprint"])

    def _check_running_release(self, record, checked):
        if (record.get("oci_manifest_digest") != checked.manifest_digest
                or record.get("oci_config_digest") != checked.config_digest):
            raise AdmissionDenied("registered preview differs from current approved OCI release")
        verify_engine_image(self.docker, checked, record.get("api_image_id"))

    def _runtime_id(self, record, token):
        candidate = self._invoke(record, token, ["ps", "-q", "api"]).strip()
        return verify_api_container(self.docker, candidate, record["compose_name"],
                                    record["api_image_id"])

    def _db(self):
        db=sqlite3.connect(str(self.registry),timeout=15,isolation_level=None)
        db.row_factory=sqlite3.Row
        db.execute("PRAGMA busy_timeout=15000")
        return db

    @staticmethod
    def _compose_name(project):
        return "wfs-preview-"+hashlib.sha256(project.encode("ascii")).hexdigest()[:20]

    def reserve(self,project_id,port):
        self._verify()
        project_id=ident(project_id)
        if isinstance(port,bool) or not isinstance(port,int) or not 19000<=port<=22000:
            raise PreviewDenied("preview port must be in the operator range 19000..22000")
        db=self._db()
        try:
            db.execute("BEGIN IMMEDIATE")
            prev=db.execute("SELECT * FROM wfs_preview_instances WHERE project_id=?",
                            (project_id,)).fetchone()
            if prev:
                if prev["port"]!=port:
                    raise PreviewDenied("project already has an immutable assigned port")
                record=dict(prev)
            else:
                name=self._compose_name(project_id)
                try:
                    db.execute("""INSERT INTO wfs_preview_instances
                               (project_id,port,phase,compose_name) VALUES(?,?,?,?)""",
                               (project_id,port,"reserved",name))
                except sqlite3.IntegrityError as exc:
                    raise PreviewDenied("port already allocated to another project") from exc
                record={"project_id":project_id,"port":port,"phase":"reserved",
                        "compose_name":name}
            db.commit()
            return record
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def status(self,project_id):
        self._verify()
        project_id=ident(project_id)
        with closing(self._db()) as db:
            r=db.execute("SELECT * FROM wfs_preview_instances WHERE project_id=?",
                         (project_id,)).fetchone()
        if r is None:
            raise PreviewDenied("preview not registered")
        out=dict(r)
        out["url"]="http://127.0.0.1:"+str(out["port"])
        out["public_preview_ready"]=False
        return out

    def _phase(self,project_id,state):
        with closing(self._db()) as db:
            db.execute("UPDATE wfs_preview_instances SET phase=? WHERE project_id=?",
                       (state,project_id))

    def _claim_transition(self, project_id, allowed):
        """Fenced state transition: at most one concurrent Docker mutation.

        begin-immediate makes a second operator/worker fail closed rather
        than executing docker compose simultaneously for the same project.
        """
        self._verify()
        db=self._db()
        try:
            db.execute("BEGIN IMMEDIATE")
            row=db.execute("SELECT phase FROM wfs_preview_instances WHERE project_id=?",
                           (project_id,)).fetchone()
            if row is None or row["phase"] not in allowed:
                raise PreviewDenied("preview state changed or is uncertain; reconcile first")
            db.execute("UPDATE wfs_preview_instances SET phase='uncertain' WHERE project_id=?",
                       (project_id,))
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def _invoke(self,record,token,args,*,timeout=120):
        # Do not rely on a one-time constructor check: the source may have
        # changed after reservation or while a preview was running.
        self._verify()
        if not isinstance(token,str) or len(token)<32 or not token.isascii():
            raise PreviewDenied("operator-supplied ephemeral token required")
        # A tiny environment allowlist: no LLM/provider keys, no HTTP-proxy
        # secrets, and no user-controlled Docker arguments. The operator
        # can opt into rootless Docker via DOCKER_HOST explicitly.
        env={name:value for name,value in os.environ.items() if name in
             ("PATH","HOME","DOCKER_HOST","DOCKER_CONFIG","XDG_RUNTIME_DIR","USER")}
        env.update({"WFS_PREVIEW_PROJECT_NAME":record["compose_name"],
                    "WFS_PREVIEW_HOST_PORT":str(record["port"]),
                    "WFS_PREVIEW_TEST_TOKEN":token})
        if self.sealed_runtime:
            # Compose must not import settings from the mutable staging cwd.
            env["COMPOSE_DISABLE_ENV_FILE"] = "1"
        # Signed original snapshot always checked BEFORE derivation.
        staged_compose=self.snapshots.verify(record["project_id"])
        if self.sealed_runtime:
            if not linux_sealing_supported():
                raise AdmissionDenied("sealed preview operator requires Linux memfd")
            cleanup = args == ["down", "--volumes", "--remove-orphans"]
            image_id = record.get("api_image_id")
            ingress_image_id = record.get("ingress_image_id")
            if cleanup:
                # Compose down uses project/service labels, not image contents.
                # It must remain available after expiry or interrupted startup.
                image_id = image_id or "sha256:" + "0" * 64
                ingress_image_id = ingress_image_id or "sha256:" + "0" * 64
            else:
                if record.get("api_frontend_sealed") != 1:
                    raise AdmissionDenied("legacy preview must be stopped and rebuilt")
                if not record.get("oci_manifest_digest"):
                    raise AdmissionDenied("legacy preview must be stopped and promoted from OCI")
                verify_local_image_exists(image_id)
                verify_local_image_exists(ingress_image_id)
            # Never permit rebuilding from a mutable Compose path. The only
            # supported start action uses a pinned, prebuilt local image ID.
            if args and args[0]=="up" and args!=[
                    "up","-d","--no-build","--pull","never"]:
                raise AdmissionDenied("sealed runtime forbids Compose source builds")
            if any(part in ("--build","build","--pull=always","--force-recreate")
                   for part in args):
                raise AdmissionDenied("sealed runtime forbids source build flags")
            raw=derive_image_only_compose(
                self.snapshots,record["project_id"],image_id,
                ingress_image_id=ingress_image_id)
            with SealedRuntimeCompose(raw) as compose:
                # Compose -f - reads its complete config from kernel-sealed
                # stdin. Neither the frontend nor ingress is host-mounted.
                argv=[self.docker,"compose","-f","-",*args]
                try:
                    with compose.open_reader() as reader:
                        result=self.runner(
                            argv,stdin=reader,cwd=str(staged_compose.parent),
                            env=env,capture_output=True,text=True,
                            timeout=timeout,check=False)
                    compose.verify()
                except (subprocess.TimeoutExpired,OSError) as exc:
                    self._phase(record["project_id"],"uncertain")
                    raise PreviewDenied("sealed Compose outcome uncertain") from exc
        else:
            # LEGACY injected unit-test runner only. No ordinary operator
            # running the real subprocess can select this fallback.
            argv=[self.docker,"compose","-f",str(staged_compose),*args]
            try:
                result=self.runner(argv,env=env,capture_output=True,text=True,
                                   timeout=timeout,check=False)
            except (subprocess.TimeoutExpired,OSError) as exc:
                self._phase(record["project_id"],"uncertain")
                raise PreviewDenied("Docker outcome uncertain; inspect before retry") from exc
        if result.returncode!=0:
            self._phase(record["project_id"],"uncertain")
            raise PreviewDenied("Docker command failed; reconciliation required")
        return str(result.stdout or "")[-16384:]

    def start(self,project_id,port,token):
        if not isinstance(token,str) or len(token)<32 or not token.isascii():
            raise PreviewDenied("operator-supplied ephemeral token required")
        if self.sealed_runtime:
            # Deny invalid release evidence before reserving or contacting Docker.
            with self._approved_release() as (snapshot, checked, _):
                record = self.reserve(project_id,port)
                if record["phase"] in ("running","uncertain"):
                    raise PreviewDenied("preview is active or uncertain; reconcile before retry")
                self._claim_transition(project_id,("reserved","stopped"))
                self.snapshots.stage(project_id)
                image_id = load_verified_image(self.docker, snapshot, checked)
                ensure_approved_runtime_images(self.snapshots)
                ingress = build_local_reviewed_ingress_image(self.snapshots,project_id)
                with closing(self._db()) as db:
                    db.execute(
                        "UPDATE wfs_preview_instances SET api_image_id=?,ingress_image_id=?, "
                        "api_frontend_sealed=1,oci_manifest_digest=?,oci_config_digest=?,oci_approval_sha256=?, "
                        "api_container_id=NULL WHERE project_id=? AND phase='uncertain'",
                        (image_id, ingress["image_id"], checked.manifest_digest,
                         checked.config_digest, self.oci_release.approval_sha256, project_id))
                record=self.status(project_id)
                self._invoke(record,token,
                             ["up","-d","--no-build","--pull","never"],timeout=240)
                runtime_id = self._runtime_id(record, token)
                with closing(self._db()) as db:
                    db.execute(
                        "UPDATE wfs_preview_instances SET phase='running',api_container_id=? "
                        "WHERE project_id=? AND phase='uncertain'", (runtime_id, project_id))
        else:
            # Synthetic unit-test runner only.
            record=self.reserve(project_id,port)
            if record["phase"] in ("running","uncertain"):
                raise PreviewDenied("preview is active or uncertain; reconcile before retry")
            self._claim_transition(project_id,("reserved","stopped"))
            self.snapshots.stage(project_id)
            self._invoke(record,token,["up","-d","--build"],timeout=240)
            self._phase(project_id,"running")
        return self.status(project_id)

    def logs(self,project_id,token):
        record=self.status(project_id)
        if record["phase"]!="running":
            raise PreviewDenied("preview is not running")
        if self.sealed_runtime:
            if not record.get("api_container_id"):
                raise AdmissionDenied("legacy preview must be stopped and promoted from OCI")
            with self._approved_release() as (_, checked, _digest):
                self._check_running_release(record, checked)
                if self._runtime_id(record, token) != record["api_container_id"]:
                    raise AdmissionDenied("registered preview API container changed")
                return self._invoke(record,token,["logs","--no-color","--tail","100"])
        return self._invoke(record,token,["logs","--no-color","--tail","100"])

    def restart(self,project_id,token):
        record=self.status(project_id)
        if record["phase"]!="running":
            raise PreviewDenied("cannot restart a stopped/uncertain preview")
        if self.sealed_runtime:
            if not record.get("api_container_id"):
                raise AdmissionDenied("legacy preview must be stopped and promoted from OCI")
            with self._approved_release() as (_, checked, _digest):
                self._check_running_release(record, checked)
                if self._runtime_id(record, token) != record["api_container_id"]:
                    raise AdmissionDenied("registered preview API container changed")
                self._claim_transition(project_id,("running",))
                self._invoke(record,token,["restart"])
                if self._runtime_id(record, token) != record["api_container_id"]:
                    raise AdmissionDenied("restarted preview API container changed")
                with closing(self._db()) as db:
                    db.execute(
                        "UPDATE wfs_preview_instances SET phase='running',oci_approval_sha256=? "
                        "WHERE project_id=? AND phase='uncertain'",
                        (self.oci_release.approval_sha256, project_id))
        else:
            self._claim_transition(project_id,("running",))
            self._invoke(record,token,["restart"])
            self._phase(project_id,"running")
        return self.status(project_id)

    def stop(self,project_id,token,*,allow_data_loss=False):
        record=self.status(project_id)
        if allow_data_loss is not True:
            raise PreviewDenied("explicit disposable volume deletion approval required")
        if record["phase"]=="stopped":
            return record
        if record["phase"]=="reserved":
            # Never started, so there is no Docker volume to delete.
            self._phase(project_id,"stopped")
            return self.status(project_id)
        if self.sealed_runtime and not linux_sealing_supported():
            raise AdmissionDenied("sealed preview operator requires Linux memfd")
        if not isinstance(token,str) or len(token)<32 or not token.isascii():
            raise PreviewDenied("operator-supplied ephemeral token required")
        self._claim_transition(project_id,("running","uncertain"))
        self._invoke(record,token,["down","--volumes","--remove-orphans"])
        self.snapshots.discard_after_authorized_stop(project_id)
        with closing(self._db()) as db:
            db.execute(
                "UPDATE wfs_preview_instances SET phase='stopped',api_container_id=NULL "
                "WHERE project_id=? AND phase='uncertain'", (project_id,))
        return self.status(project_id)
