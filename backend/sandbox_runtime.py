"""Isolated project test sandbox for a *separate*, explicitly authorized Docker worker.

Never import this module in the HTTP gateway or mount docker.sock there.
Operator configures the image; LLM output never selects an image or flags.
No network, privilege escalation, host source write, or Docker socket bind.
"""
import os
from pathlib import Path
import re
import secrets
import subprocess
import time

_SAFE=re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\Z")


class SandboxDenied(PermissionError):
    pass


class SandboxRuntime:
    def __init__(self, workspace_root, image, *, enabled=False, runner=None,
                 docker_binary="docker"):
        if not enabled:
            raise SandboxDenied("Docker worker is disabled until operator authorization")
        if not isinstance(image,str) or not image or any(x in image for x in ("\x00","\n","\r"," ")):
            raise ValueError("operator must configure one trusted image")
        self.root=Path(workspace_root).resolve()
        if not self.root.is_dir():
            raise SandboxDenied("operator workspace root must exist")
        self.image=image
        self.docker=docker_binary
        self.runner=runner or subprocess.run

    @staticmethod
    def _id(value,label):
        if not isinstance(value,str) or not _SAFE.fullmatch(value) or value in (".",".."):
            raise SandboxDenied(f"invalid {label}")
        return value

    def _workspace(self,project_id,job_id,attempt):
        p,j=self._id(project_id,"project_id"),self._id(job_id,"job_id")
        if isinstance(attempt,bool) or not isinstance(attempt,int) or not 1<=attempt<=10:
            raise SandboxDenied("invalid attempt")
        components=(p,j,f"attempt-{attempt}")
        current=self.root
        for component in components:
            lexical=current/component
            if lexical.is_symlink() or lexical.resolve()!=lexical or not lexical.is_dir():
                raise SandboxDenied("workspace missing, symlinked or outside project")
            current=lexical
        if not current.is_relative_to(self.root):
            raise SandboxDenied("workspace escaped root")
        if "," in str(current) or ":" in str(current):
            raise SandboxDenied("unsafe mount path")
        return current

    def command(self,project_id,job_id,attempt,arguments,*,container_name=None):
        """Return immutable argv (no shell interpolation or host networking)."""
        workspace=self._workspace(project_id,job_id,attempt)
        if not isinstance(arguments,(list,tuple)) or not 1<=len(arguments)<=64:
            raise SandboxDenied("invalid sandbox command")
        if any(not isinstance(a,str) or not a or len(a)>4096 or
               "\x00" in a for a in arguments):
            raise SandboxDenied("invalid command argument")
        name=container_name or ("wfs-sbx-"+project_id[:16]+"-"+secrets.token_hex(8))
        self._id(name,"container_name")
        return [self.docker,"run","--rm","--name",name,
                "--network","none","--ipc","none","--read-only",
                "--cap-drop","ALL","--security-opt","no-new-privileges",
                "--pids-limit","64","--memory","256m","--cpus","0.5",
                "--ulimit","nofile=128:128","--user","65534:65534",
                "--tmpfs","/tmp:rw,nosuid,nodev,noexec,size=64m",  # nosec B108 -- private container tmpfs, not a host temp directory
                "--env","HOME=/tmp","--workdir","/workspace",
                "--mount",f"type=bind,src={workspace},dst=/workspace,readonly",
                self.image,*arguments]

    def execute(self,project_id,job_id,attempt,arguments,*,timeout_seconds=120):
        """Actual Docker execution; always attempt cleanup after exit or timeout."""
        if isinstance(timeout_seconds,bool) or not isinstance(timeout_seconds,int) or not 1<=timeout_seconds<=600:
            raise ValueError("timeout_seconds must be 1..600")
        name="wfs-sbx-"+self._id(project_id,"project_id")[:16]+"-"+secrets.token_hex(8)
        argv=self.command(project_id,job_id,attempt,arguments,container_name=name)
        try:
            outcome=self.runner(argv,capture_output=True,text=True,timeout=timeout_seconds)
            return {"status":"passed" if outcome.returncode==0 else "failed",
                    "returncode":outcome.returncode,
                    "stdout":str(outcome.stdout or "")[-16384:],
                    "stderr":str(outcome.stderr or "")[-16384:],
                    "container":name}
        except subprocess.TimeoutExpired:
            return {"status":"timeout","returncode":None,"stdout":"",
                    "stderr":"sandbox timeout; container removal requested",
                    "container":name}
        finally:
            # --rm cleans successful containers; rm -f handles timeout and
            # cancelled subprocess. Never disclose host docker diagnostics.
            try:
                self.runner([self.docker,"rm","-f",name],
                            capture_output=True,text=True,timeout=15)
            except (subprocess.TimeoutExpired,OSError):
                pass

    def execute_fenced(self,project_id,job_id,attempt,arguments,*,fence,timeout_seconds=90):
        """Run the real container and terminate it if authorization is revoked.

        Invoke ONLY from the dedicated worker. The trusted fence rechecks
        project ACL, queue lease, launch approval, pause and worker shutdown.
        Never wait until the full QA timeout to notice a cancelled lease.
        """
        if not callable(fence):
            raise SandboxDenied("live lease fence callback is mandatory")
        if isinstance(timeout_seconds,bool) or not isinstance(timeout_seconds,int) or not 1<=timeout_seconds<=600:
            raise ValueError("timeout_seconds must be 1..600")
        fence()
        name="wfs-sbx-"+self._id(project_id,"project_id")[:16]+"-"+secrets.token_hex(8)
        argv=self.command(project_id,job_id,attempt,arguments,container_name=name)
        process=None
        began=time.monotonic()
        try:
            process=subprocess.Popen(argv,stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE,text=True)
            while True:
                fence()
                if time.monotonic()-began>=timeout_seconds:
                    return {"status":"timeout","returncode":None,"stdout":"",
                            "stderr":"Docker sandbox deadline exceeded","container":name}
                try:
                    out,err=process.communicate(timeout=0.25)
                    fence()
                    return {"status":"passed" if process.returncode==0 else "failed",
                            "returncode":process.returncode,
                            "stdout":str(out or "")[-16384:],
                            "stderr":str(err or "")[-16384:],"container":name}
                except subprocess.TimeoutExpired:
                    continue
        finally:
            # A revoked lease is a physical container kill, not only a DB flag.
            try:
                subprocess.run([self.docker,"rm","-f",name],capture_output=True,
                               text=True,timeout=15)
            except (subprocess.TimeoutExpired,OSError):
                pass
            if process is not None and process.poll() is None:
                process.kill()
                try:
                    process.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
