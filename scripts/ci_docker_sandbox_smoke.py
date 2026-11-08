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
runner=SandboxRuntime(root,"python:3.11-alpine@sha256:bb1d70c1df30d8ee1e05214dbe82d6cdfd29833c1f47ce917f20991aca93acaa",enabled=True)
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
# Runtime HostConfig inspected from a running container, not only authored
# command-line arguments. No app or public gateway has the Docker socket.
import secrets
from concurrent.futures import ThreadPoolExecutor

inspect_name="wfs-sbx-inspect-"+secrets.token_hex(5)
inspect_args=runner.command("alpha","job-one",1,["python","-c","import time;time.sleep(15)"],
                           container_name=inspect_name)
inspect_args.insert(2,"-d")
started=subprocess.run(inspect_args,capture_output=True,text=True,timeout=30)
if started.returncode!=0:
    raise SystemExit("Docker detached inspection container failed: "+started.stderr[-1200:])
try:
    raw=subprocess.run(["docker","inspect","--format","{{json .HostConfig}}",inspect_name],
                       capture_output=True,text=True,check=True,timeout=15)
    config=json.loads(raw.stdout)
    assert config["ReadonlyRootfs"] is True
    assert config["NetworkMode"]=="none"
    assert config["Memory"]==268435456
    assert config["NanoCpus"]==500000000
    assert config["PidsLimit"]==64
    assert any("no-new-privileges" in option for option in config["SecurityOpt"])
    assert "ALL" in [x.upper() for x in config["CapDrop"]]
    assert any(m.get("ReadOnly") and m.get("Target")=="/workspace"
               for m in config.get("Mounts",[]))
    data["daemon_limits_verified"]=True
finally:
    subprocess.run(["docker","rm","-f",inspect_name],
                   capture_output=True,text=True,timeout=15)

# Two real containers with project-specific mounts running concurrently.
probe_bravo=(probe.replace("ALPHA_ONLY","BRAVO_ONLY")
                 .replace("'BRAVO_ONLY' not in", "'ALPHA_ONLY' not in"))
with ThreadPoolExecutor(max_workers=2) as pool:
    future_a=pool.submit(runner.execute,"alpha","job-one",1,
                         ["python","-c",probe],timeout_seconds=40)
    future_b=pool.submit(runner.execute,"bravo","job-two",1,
                         ["python","-c",probe_bravo],timeout_seconds=40)
    outcomes=[future_a.result(),future_b.result()]
if any(item["status"]!="passed" for item in outcomes):
    raise SystemExit("parallel Docker execution failed: "+json.dumps(outcomes))
data["parallel_project_isolation"]=True
data["cleanup"]=True
report={"runtime":"docker","network":"none","image":"python:3.11-alpine@sha256:bb1d70c1df30d8ee1e05214dbe82d6cdfd29833c1f47ce917f20991aca93acaa",
        "project":"alpha","checks":data,"limits":{"memory":"256m","cpus":0.5,"pids":64}}
target=Path("artifacts/docker")
target.mkdir(parents=True,exist_ok=True)
(target/"runtime-proof.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report))
