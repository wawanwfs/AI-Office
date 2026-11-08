#!/usr/bin/env python3
"""Local-only WFS operator token minting. NOT an HTTP endpoint.

Example:
WFS_LOCAL_OPERATOR_APPROVED=YES WFS_AUTH_DB=/secure/wfs-auth.db \
  python scripts/wfs_auth_token.py wawanwfs

Store output securely. Do not paste in web pages, shell history or git.
"""
import os
import sys
from pathlib import Path

repo=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(repo/"backend"))
from secure_control_api import TokenStore


if __name__=="__main__":
    if os.environ.get("WFS_LOCAL_OPERATOR_APPROVED")!="YES":
        raise SystemExit("Denied: local operator consent is mandatory")
    if not os.environ.get("WFS_AUTH_DB") or len(sys.argv)!=2:
        raise SystemExit("usage: WFS_AUTH_DB=/secure/auth.db python scripts/wfs_auth_token.py <principal>")
    store=TokenStore(os.environ["WFS_AUTH_DB"])
    value=store.mint_local(sys.argv[1])
    print("Bearer token (visible only once, expires in 1h):",value)
