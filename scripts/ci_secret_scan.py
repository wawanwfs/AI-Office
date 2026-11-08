#!/usr/bin/env python3
"""High-confidence secret-pattern gate on tracked files (not full entropy scan).

No matching secret content is printed or saved. This supplements the scoped
Bandit and dependency scans; it is not a replacement for external gitleaks
or historical commit scanning.
"""
from pathlib import Path
import json
import re
import subprocess
import sys

_RULES={
    "private_key_header":re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----"),
    "aws_access_key":re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "github_classic_token":re.compile(rb"\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{36}\b"),
    "github_fine_grained_token":re.compile(rb"\bgithub_pat_[A-Za-z0-9_]{70,}\b"),
    "openai_project_token":re.compile(rb"\bsk-proj-[A-Za-z0-9_-]{40,}\b"),
}


def inspect_bytes(data):
    return [name for name,expr in _RULES.items() if expr.search(data)]


def scan_tracked(root):
    listing=subprocess.run(["git","ls-files","-z"],cwd=root,capture_output=True,
                           check=True,timeout=15).stdout
    findings=[]
    total=0
    for name in listing.split(b"\x00"):
        if not name:
            continue
        path=Path(root)/name.decode("utf-8",errors="strict")
        if path.is_symlink() or not path.is_file() or path.stat().st_size>4*1024*1024:
            continue
        data=path.read_bytes()
        if b"\x00" in data:
            continue
        total+=1
        for rule in inspect_bytes(data):
            findings.append({"path":str(path.relative_to(root)), "rule":rule})
    return {"scanned_tracked_text_files":total,"violations":findings}


if __name__=="__main__":
    report=scan_tracked(Path(__file__).resolve().parents[1])
    target=Path("artifacts/security")
    target.mkdir(parents=True,exist_ok=True)
    (target/"secret-scan.json").write_text(json.dumps(report,indent=2))
    # Intentionally print names only; never leak a candidate credential.
    print(json.dumps(report))
    if report["violations"]:
        raise SystemExit("High-confidence secret pattern detected")
