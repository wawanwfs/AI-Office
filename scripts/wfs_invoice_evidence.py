#!/usr/bin/env python3
"""LOCAL operator-only invoice discrepancy intake. No network or secret API.

Manual evidence is never considered official provider verification and never
releases ledger reservations. Operator must independently inspect the invoice.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from billing_reconcile import InvoiceReconciliation
from cost_ledger import CostLedger


def main(argv=None):
    parser=argparse.ArgumentParser(description="WFS local invoice discrepancy reviewer")
    parser.add_argument("--db",required=True,help="EXISTING private CostLedger SQLite DB")
    parser.add_argument("--project",required=True)
    parser.add_argument("--report",action="store_true",help="read-only discrepancy summary")
    parser.add_argument("--ack-manual",action="store_true",
        help="explicit operator acknowledgment; does NOT authenticate invoice")
    parser.add_argument("--call-id")
    parser.add_argument("--provider")
    parser.add_argument("--line-id")
    parser.add_argument("--billed-microusd",type=int)
    parser.add_argument("--invoice-file")
    parser.add_argument("--approved-by")
    args=parser.parse_args(argv)
    path=Path(args.db).absolute()
    if path.is_symlink() or not path.is_file() or path.resolve()!=path:
        parser.error("CostLedger DB must exist as ordinary local file")
    audit=InvoiceReconciliation(CostLedger(path))
    if args.report:
        print(json.dumps(audit.report(args.project),indent=2))
        return 0
    if not args.ack_manual:
        parser.error("invoice evidence import requires --ack-manual")
    required=("call_id","provider","line_id","billed_microusd",
              "invoice_file","approved_by")
    missing=[k for k in required if getattr(args,k) is None]
    if missing:
        parser.error("missing operator evidence fields: "+", ".join(missing))
    source=Path(args.invoice_file).absolute()
    if (source.is_symlink() or not source.is_file() or source.resolve()!=source
            or not 1<=source.stat().st_size<=10*1024*1024):
        parser.error("invoice evidence file must be local, regular and <= 10MiB")
    digest=hashlib.sha256()
    with source.open("rb") as stream:
        for block in iter(lambda:stream.read(1_048_576),b""):
            digest.update(block)
    changed=audit.add_local_evidence(
        project_id=args.project,call_id=args.call_id,provider=args.provider,
        invoice_line_id=args.line_id,billed_microusd=args.billed_microusd,
        invoice_sha256=digest.hexdigest(),approved_by=args.approved_by)
    print(json.dumps({"operator_receipt_created":changed,
                      "invoice_sha256":digest.hexdigest(),
                      "provider_invoice_verified":False,
                      "balance_changed":False},indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
