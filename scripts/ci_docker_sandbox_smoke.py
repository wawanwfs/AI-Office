#!/usr/bin/env python3
"""REAL Docker runtime proof on GitHub-hosted Linux (not a production host).

Requires Docker daemon ONLY in this CI runner / dedicated worker; no HTTP
gateway Docker socket access. Fails if network, user, read-only or isolation
contract is violated. Artifacts include results but not host credentials.
"""
import json
from pathlib import Path
import subprocess
import tempfile
from sandbox_runtime import SandboxRuntime

root=Path(tempfile.mkdtemp(prefix="wfs-sandbox-ci-")).resolve()
a=root/"alpha"/"job-one"/"attempt-1"
b=root/"bravo"/"job-two"/"attempt-1"
a.mkdir(parents=True)
b.mkdir(parents=True)
(a/"project.txt").write_text("ALPHA_ONLY")
(b/"project.txt").write_text("BRAVO_ONLY")
probe=r"""
import json,os,pathlib,socket
from pathlib import Path
checks={}
checks['uid_unprivileged']=os.geteuid()==65534
checks['own_project_mounted']=Path('/workspace/project.txt').read_text().strip()=='ALPHA_ONLY'
checks['other_project_absent']=not Path('/workspace/bravo').exists() and 'BRAVO_ONLY' not in Path('/workspace/project.txt').read_text()
for key,path in [('workspace_ro',Path('/workspace/cannot-write')),('root_ro',Path('/etc/cannot-write'))]:
    try:
        path.write_text('bad')
        checks[key]=False
    except OSError:
        checks[key]=True
try:
    socket.socket().connect(('1.1.1.1',80))
    checks['no_egress']=False
except OSError:
    checks['no_egress']=True
Path('/tmp/scratch.txt').write_text('test')
checks['tmpfs_writable']=Path('/tmp/scratch.txt').read_text()=='test'
print(json.dumps(checks))
if not all(checks.values()):
    raise SystemExit(17)
"""
runner=SandboxRuntime(root,"python:3.11-alpine",enabled=True)
out=runner.execute("alpha","job-one",1,["python","-c",probe],timeout_seconds=40)
if out["status"]!="passed":
    raise SystemExit("real Docker smoke failed: "+json.dumps(out))
data=json.loads(out["stdout"].strip().splitlines()[-1])
if not all(data.values()):
    raise SystemExit("a Docker security assertion is false: "+json.dumps(data))
ps=subprocess.run(["docker","ps","-a","--filter","name="+out["container"],"--format","{{.Names}}"],
                  capture_output=True,text=True,check=True,timeout=10)
if out["container"] in ps.stdout:
    raise SystemExit("sandbox container did not clean up")
data["cleanup"]=True
report={"runtime":"docker","network":"none","image":"python:3.11-alpine",
        "project":"alpha","checks":data,"limits":{"memory":"256m","cpus":0.5,"pids":64}}
target=Path("artifacts/docker")
target.mkdir(parents=True,exist_ok=True)
(target/"runtime-proof.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report))
