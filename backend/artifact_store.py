"""Verified read-only artifacts: only a completed, attested queue job is downloadable.

Never trust project, job, file, path or manifest content supplied by a
request. File bytes are verified against the sealed SHA-256 before response.
The database and filesystem are separate security boundaries; both are
checked. This service does not execute code or access a Docker daemon.
"""
import hashlib
import json
from pathlib import Path
import re
import stat

from project_rbac import ident

_FILE=re.compile(r"[A-Za-z0-9_./-]{1,256}\Z")
_SHA=re.compile(r"[a-f0-9]{64}\Z")


class ArtifactNotReady(PermissionError):
    pass


class VerifiedArtifacts:
    def __init__(self, root):
        self.root=Path(root).resolve()
        if not self.root.is_dir():
            raise ArtifactNotReady("artifact root is not provisioned")

    def _directory(self, project_id, job):
        project_id=ident(project_id)
        if job is None or job.get("project_id")!=project_id or job.get("status")!="completed":
            raise ArtifactNotReady("artifact not completed or not in project")
        jid=ident(job.get("id"))
        attempt=job.get("attempt")
        if isinstance(attempt,bool) or not isinstance(attempt,int) or not 1<=attempt<=10:
            raise ArtifactNotReady("invalid attestation attempt")
        cursor=self.root
        for component in (project_id,jid,f"attempt-{attempt}"):
            candidate=cursor/component
            if candidate.is_symlink() or not candidate.is_dir() or candidate.resolve()!=candidate:
                raise ArtifactNotReady("unsafe or missing artifact workspace")
            cursor=candidate
        if not cursor.is_relative_to(self.root):
            raise ArtifactNotReady("artifact directory escaped root")
        return cursor

    @staticmethod
    def _regular(root,rel):
        if not isinstance(rel,str) or not _FILE.fullmatch(rel):
            raise ArtifactNotReady("invalid artifact path")
        p=Path(rel)
        if p.is_absolute() or "." in p.parts or ".." in p.parts or any(x.startswith(".") for x in p.parts):
            raise ArtifactNotReady("artifact traversal blocked")
        current=root
        for part in p.parts:
            current=current/part
            if current.is_symlink():
                raise ArtifactNotReady("symlinked artifact denied")
        if not current.is_file() or not stat.S_ISREG(current.stat().st_mode):
            raise ArtifactNotReady("artifact not a regular file")
        if not current.resolve().is_relative_to(root):
            raise ArtifactNotReady("artifact outside workspace")
        if not 1<=current.stat().st_size<=2*1024*1024:
            raise ArtifactNotReady("artifact size invalid")
        return current

    def _manifest(self,project_id,job):
        root=self._directory(project_id,job)
        path=root/".wfs-qa-attestation.json"
        if path.is_symlink() or not path.is_file() or path.stat().st_size>65536:
            raise ArtifactNotReady("verified manifest not available")
        try:
            data=json.loads(path.read_text())
        except (ValueError,UnicodeDecodeError) as exc:
            raise ArtifactNotReady("invalid manifest") from exc
        if (not isinstance(data,dict) or data.get("format")!="wfs-artifact-qa-v1"
                or data.get("project_id")!=project_id or data.get("job_id")!=job["id"]
                or data.get("attempt")!=job["attempt"]
                or not isinstance(data.get("tests_passed"),int) or data["tests_passed"]<1
                or not isinstance(data.get("files"),dict) or not data["files"]
                or len(data["files"])>100):
            raise ArtifactNotReady("attestation does not match completed job")
        return root,data

    def listing(self,project_id,job):
        root,manifest=self._manifest(project_id,job)
        return {"project_id":project_id,"job_id":job["id"],
                "tests_passed":manifest["tests_passed"],
                "files":[{"path":path,"sha256":digest}
                         for path,digest in sorted(manifest["files"].items())
                         if isinstance(digest,str) and _SHA.fullmatch(digest)]}

    def read(self,project_id,job,rel):
        root,manifest=self._manifest(project_id,job)
        expected=manifest["files"].get(rel)
        if not isinstance(expected,str) or not _SHA.fullmatch(expected):
            raise ArtifactNotReady("path was not attested")
        file=self._regular(root,rel)
        content=file.read_bytes()
        if hashlib.sha256(content).hexdigest()!=expected:
            raise ArtifactNotReady("artifact digest mismatch since QA")
        return content
