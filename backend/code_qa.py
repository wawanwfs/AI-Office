"""Fail-closed, separate-worker Python code QA with content-addressed artifacts.

Only a trusted local worker constructs this service. Generated tests execute
inside a network-disabled, read-only Docker container, NEVER in HTTP gateway.
The operator pins the image digest. Files are not promoted unless a lease,
RBAC, objective tests and content digests all pass.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat

from sandbox_runtime import SandboxRuntime, SandboxDenied

_IMAGE=re.compile(r"python:3\.11-alpine@sha256:[a-f0-9]{64}\Z")
_TEST_RE=re.compile(r"Ran (\d+) tests? in [\d.]+s")
_MAX_FILES=100
_MAX_BYTES=2*1024*1024


class CodeQAFailed(RuntimeError):
    pass


class PythonCodeQA:
    def __init__(self, workspace_root, image, *, enabled=False, runtime=None):
        if not enabled:
            raise SandboxDenied("code QA disabled; operator approval is required")
        if not _IMAGE.fullmatch(image or ""):
            raise SandboxDenied("Python QA image must be the operator-pinned digest")
        self.workspace_root=Path(workspace_root).resolve()
        self.runtime=runtime or SandboxRuntime(self.workspace_root,image,enabled=True)

    def _snapshot(self, workspace, paths):
        """Reject symlink aliases and non-regular files, hash exact bytes."""
        if not isinstance(paths,list) or not 1<=len(paths)<=_MAX_FILES:
            raise CodeQAFailed("no bounded code artifacts")
        root=Path(workspace).resolve()
        if not root.is_dir() or root.is_symlink():
            raise CodeQAFailed("workspace not a real directory")
        found={}
        total=0
        for raw in paths:
            if not isinstance(raw,str) or not raw or len(raw)>256:
                raise CodeQAFailed("invalid relative artifact")
            rel=Path(raw)
            if (rel.is_absolute() or ".." in rel.parts or "." in rel.parts or
                    any(part.startswith(".") for part in rel.parts) or
                    str(rel) in found):
                raise CodeQAFailed("untrusted artifact path")
            path=root/rel
            if not path.resolve().is_relative_to(root):
                raise CodeQAFailed("artifact escaped workspace")
            current=root
            for part in rel.parts:
                current=current/part
                if current.is_symlink():
                    raise CodeQAFailed("symlinked artifact denied")
            if not path.is_file() or not stat.S_ISREG(path.stat().st_mode):
                raise CodeQAFailed("missing or unsafe artifact")
            size=path.stat().st_size
            if size<1 or size>_MAX_BYTES:
                raise CodeQAFailed("empty or oversized artifact")
            total+=size
            if total>_MAX_BYTES:
                raise CodeQAFailed("artifact aggregate too large")
            found[str(rel)]=hashlib.sha256(path.read_bytes()).hexdigest()
        return found

    def verify(self, project_id, claim, workspace, paths, fence):
        """Execute objective tests and seal an evidence manifest on success.

        Call from a separate privileged worker, never from an HTTP handler.
        fence() must verify queue lease + current RBAC + approval.
        """
        fence()
        expected=self.runtime._workspace(project_id,claim["id"],claim["attempt"])
        if expected!=Path(workspace).resolve() or expected!=Path(workspace):
            raise CodeQAFailed("workspace does not match immutable queue claim")
        before=self._snapshot(expected,paths)
        tests=[p for p in before if Path(p).name.startswith("test_") and p.endswith(".py")]
        code=[p for p in before if p.endswith(".py") and p not in tests]
        if not tests or not code:
            raise CodeQAFailed("Python source and objective unittest test_*.py required")
        # trusted, constant command: LLM cannot select image, test command,
        # arguments, environment variables or host mounts.
        command=["python","-B","-m","unittest","discover","-s","/workspace",
                 "-p","test_*.py","-v"]
        fenced=getattr(self.runtime,"execute_fenced",None)
        if callable(fenced):
            result=fenced(project_id,claim["id"],claim["attempt"],command,
                          fence=fence,timeout_seconds=90)
        else:
            # Compatibility for isolated unit-test adapters only.
            result=self.runtime.execute(project_id,claim["id"],claim["attempt"],
                                        command,timeout_seconds=90)
        fence()
        if result["status"]!="passed":
            raise CodeQAFailed("Docker objective QA failed: "+str(result["status"]))
        reported=str(result.get("stdout",""))+"\n"+str(result.get("stderr",""))
        counts=_TEST_RE.findall(reported)
        if not counts or int(counts[-1])<1 or not re.search(r"\bOK\b",reported):
            raise CodeQAFailed("QA did not execute at least one passing test")
        after=self._snapshot(expected,paths)
        if before!=after:
            raise CodeQAFailed("files changed while QA was executing")
        fence()
        manifest={"format":"wfs-artifact-qa-v1","project_id":project_id,
                  "job_id":claim["id"],"attempt":claim["attempt"],
                  "files":after,"tests_passed":int(counts[-1]),
                  "container":result["container"],"qa":"docker-unittest"}
        dest=expected/".wfs-qa-attestation.json"
        data=json.dumps(manifest,sort_keys=True,indent=2).encode("utf-8")
        if dest.exists() or dest.is_symlink():
            raise CodeQAFailed("QA manifest already present; attempt cannot be reused")
        try:
            fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,"wb") as file:
                file.write(data)
                file.flush()
                os.fsync(file.fileno())
            fence()
        except BaseException:
            dest.unlink(missing_ok=True)
            raise
        return manifest
