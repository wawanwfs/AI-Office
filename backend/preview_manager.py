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


class PreviewDenied(PermissionError):
    pass


class TemplatePreviewManager:
    def __init__(self, registry_path, template_path, *, enabled=False,
                 runner=None, docker="docker", reviewed_files=None,
                 reviewer_authority=None):
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
        self.runner=runner or subprocess.run
        with closing(self._db()) as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS wfs_preview_instances(
                  project_id TEXT PRIMARY KEY,
                  port INTEGER NOT NULL UNIQUE CHECK(port BETWEEN 19000 AND 22000),
                  phase TEXT NOT NULL CHECK(phase IN
                    ('reserved','running','stopped','uncertain')),
                  compose_name TEXT NOT NULL UNIQUE
                );
            """)

    def _verify(self):
        """Fail closed for revoked/policy-changed approvals and altered bytes."""
        self.authority.verify(self.reviewed_manifest)
        self.admission.verify()
        return True

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
                    db.execute("""INSERT INTO wfs_preview_instances VALUES(?,?,?,?)""",
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
        argv=[self.docker,"compose","-f",str(self.template),*args]
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
        record=self.reserve(project_id,port)
        if record["phase"] in ("running","uncertain"):
            raise PreviewDenied("preview is active or uncertain; reconcile before retry")
        self._claim_transition(project_id,("reserved","stopped"))
        self._invoke(record,token,["up","-d","--build"],timeout=240)
        self._phase(project_id,"running")
        return self.status(project_id)

    def logs(self,project_id,token):
        record=self.status(project_id)
        if record["phase"]!="running":
            raise PreviewDenied("preview is not running")
        return self._invoke(record,token,["logs","--no-color","--tail","100"])

    def restart(self,project_id,token):
        record=self.status(project_id)
        if record["phase"]!="running":
            raise PreviewDenied("cannot restart a stopped/uncertain preview")
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
        self._claim_transition(project_id,("running","uncertain","reserved"))
        self._invoke(record,token,["down","--volumes","--remove-orphans"])
        self._phase(project_id,"stopped")
        return self.status(project_id)
