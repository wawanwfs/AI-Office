#!/usr/bin/env python3
"""WFS preview operator CLI — disposable reviewed example only.

Never invoke from the public gateway, user task prompt or an LLM tool.
Runs Docker Compose under an explicitly approved local operator.
The current preview is the fixed reviewed React/FastAPI/Postgres template;
arbitrary generated project source admission is NOT available.
"""
import argparse
import os
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from preview_manager import TemplatePreviewManager, PreviewDenied


def main():
    parser=argparse.ArgumentParser(description="WFS isolated template preview operator")
    parser.add_argument("action",choices=("start","status","logs","restart","stop"))
    parser.add_argument("--project",required=True)
    parser.add_argument("--port",type=int,help="19000-22000; required only on start")
    parser.add_argument("--state-root",required=True,help="private local disposable directory")
    parser.add_argument("--approved",action="store_true")
    parser.add_argument("--discard-data",action="store_true",
                        help="required to remove disposable PostgreSQL volumes")
    args=parser.parse_args()
    if not args.approved:
        parser.error("local operator approval (--approved) is mandatory")
    if args.action=="start" and args.port is None:
        parser.error("start requires --port")
    if args.action!="start" and args.port is not None:
        parser.error("--port is only used for start")
    state=Path(args.state_root).absolute()
    if state.is_symlink():
        parser.error("symlinked state directory denied")
    if not state.exists():
        state.mkdir(parents=True,mode=0o700)
    if not state.is_dir() or state.resolve()!=state:
        parser.error("unsafe state root")
    template=Path(__file__).resolve().parents[1]/"examples"/"fullstack-preview"/"compose.yaml"
    manager=TemplatePreviewManager(state/"registry.db",template,enabled=True)
    if args.action=="status":
        result=manager.status(args.project)
    else:
        token=os.environ.get("WFS_PREVIEW_TEST_TOKEN","")
        if not token:
            parser.error("WFS_PREVIEW_TEST_TOKEN must be explicitly provided in environment")
        if args.action=="start":
            result=manager.start(args.project,args.port,token)
        elif args.action=="logs":
            result=manager.logs(args.project,token)
        elif args.action=="restart":
            result=manager.restart(args.project,token)
        else:
            result=manager.stop(args.project,token,allow_data_loss=args.discard_data)
    print(result)
    if args.action in ("start","restart"):
        print("Loopback preview only. Not authenticated public multi-tenant deployment.")


if __name__=="__main__":
    main()
