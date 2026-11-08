"""Operator-only invoice CLI: no unapproved write and no automatic settlement."""
import json
from pathlib import Path
import subprocess
import sys

from cost_ledger import CostLedger


def test_invoice_cli_import_is_immutable_and_operator_approved(tmp_path):
    ledger=CostLedger(tmp_path/"cost.db")
    ledger.set_budget("alpha",100000,approved_by="owner")
    ledger.set_price("provider.example","model-x",
        input_microusd_per_million=1000000,
        output_microusd_per_million=2000000)
    call=ledger.reserve("alpha","task-1","agent-1",
        "provider.example","model-x",prompt_tokens=100,max_completion_tokens=100)
    ledger.settle(call,{"prompt_tokens":10,"completion_tokens":20})
    source=tmp_path/"invoice sample #1.json"
    source.write_text('{"manual_evidence_only": true}')
    tool=Path(__file__).resolve().parents[1]/"scripts"/"wfs_invoice_evidence.py"
    cmd=[sys.executable,str(tool),"--db",str(tmp_path/"cost.db"),
         "--project","alpha","--call-id",call,"--provider","provider.example",
         "--line-id","line-1","--billed-microusd","50",
         "--invoice-file",str(source),"--approved-by","owner"]
    without=subprocess.run(cmd,capture_output=True,text=True)
    assert without.returncode!=0 and "--ack-manual" in without.stderr
    before=ledger.summary("alpha")
    first=subprocess.run(cmd+["--ack-manual"],capture_output=True,text=True)
    assert first.returncode==0,first.stderr
    assert json.loads(first.stdout)["operator_receipt_created"] is True
    again=subprocess.run(cmd+["--ack-manual"],capture_output=True,text=True)
    assert again.returncode==0
    assert json.loads(again.stdout)["operator_receipt_created"] is False
    report=subprocess.run([sys.executable,str(tool),"--db",str(tmp_path/"cost.db"),
                           "--project","alpha","--report"],capture_output=True,text=True)
    assert report.returncode==0,report.stderr
    assert json.loads(report.stdout)["matched"]==1
    assert json.loads(report.stdout)["provider_invoice_verified"] is False
    assert ledger.summary("alpha")==before
