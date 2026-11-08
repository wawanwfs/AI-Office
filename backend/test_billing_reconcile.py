"""Invoice evidence is owner-reviewed and never changes a reserved charge."""
import pytest
from cost_ledger import CostLedger
from billing_reconcile import InvoiceReconciliation,InvoiceConflict


@pytest.fixture
def scenario(tmp_path):
    ledger=CostLedger(tmp_path/"cost.db")
    for p in ("alpha","bravo"):
        ledger.set_budget(p,100000,approved_by="owner")
    ledger.set_price("provider.example","model-x",
        input_microusd_per_million=1000000,
        output_microusd_per_million=2000000)
    good=ledger.reserve("alpha","task1","agent1",
        "provider.example","model-x",prompt_tokens=100,max_completion_tokens=100)
    ledger.settle(good,{"prompt_tokens":10,"completion_tokens":20})
    unknown=ledger.reserve("alpha","task2","agent1",
        "provider.example","model-x",prompt_tokens=100,max_completion_tokens=100)
    ledger.mark_uncertain(unknown,"provider request timeout")
    other=ledger.reserve("bravo","task3","agent1",
        "provider.example","model-x",prompt_tokens=100,max_completion_tokens=100)
    ledger.settle(other,{"prompt_tokens":4,"completion_tokens":5})
    return ledger,InvoiceReconciliation(ledger),good,unknown,other


def invoice(project,call,line,amount):
    return dict(project_id=project,call_id=call,provider="provider.example",
                invoice_line_id=line,billed_microusd=amount,
                invoice_sha256="f"*64,approved_by="owner")


def test_matching_evidence_is_immutable_and_budget_not_changed(scenario):
    ledger,a,good,unknown,other=scenario
    before=ledger.summary("alpha")
    args=invoice("alpha",good,"line-a1",50)
    assert a.add_local_evidence(**args)
    assert not a.add_local_evidence(**args)
    report=a.report("alpha")
    assert report["matched"]==1
    assert report["requires_review"]==1
    assert report["provider_invoice_verified"] is False
    assert ledger.summary("alpha")==before


def test_mismatched_or_multiple_invoice_lines_are_not_matched(scenario):
    ledger,a,good,unknown,other=scenario
    a.add_local_evidence(**invoice("alpha",good,"line-a1",55))
    found={x["call_id"]:x for x in a.report("alpha")["calls"]}
    assert found[good]["status"]=="amount-mismatch"
    a.add_local_evidence(**invoice("alpha",good,"line-a2",5))
    found={x["call_id"]:x for x in a.report("alpha")["calls"]}
    assert found[good]["status"]=="invoice-ambiguous"


def test_cross_tenant_and_conflicting_receipts_denied(scenario):
    ledger,a,good,unknown,other=scenario
    args=invoice("alpha",good,"line-a1",50)
    a.add_local_evidence(**args)
    for change in (dict(project_id="bravo"),dict(call_id=other),
                   dict(billed_microusd=52),dict(invoice_sha256="0"*64)):
        with pytest.raises(InvoiceConflict):
            a.add_local_evidence(**{**args,**change})
    with pytest.raises(ValueError):
        a.add_local_evidence(**{**args,"invoice_line_id":"../bad"})
    with pytest.raises(ValueError):
        a.add_local_evidence(**{**args,"billed_microusd":True})
    assert a.report("bravo")["matched"]==0


def test_invoice_does_not_clear_unknown_provider_charge(scenario):
    ledger,a,good,unknown,other=scenario
    before=ledger.summary("alpha")
    a.add_local_evidence(**invoice("alpha",unknown,"line-uncertain",0))
    found={x["call_id"]:x for x in a.report("alpha")["calls"]}
    assert found[unknown]["status"]=="uncertain-charge"
    assert ledger.summary("alpha")==before
