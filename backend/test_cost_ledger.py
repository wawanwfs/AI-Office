"""Cost controls: real SQLite transactions; no network or provider calls."""
from concurrent.futures import ThreadPoolExecutor
import pytest
from cost_ledger import CostLedger, BudgetDenied


@pytest.fixture
def ledger(tmp_path):
    l = CostLedger(tmp_path / "budget.db")
    l.set_budget("project-1", 15_000_000, approved_by="owner")
    l.set_price("provider-a","model-a",
                input_microusd_per_million=1_000_000,
                output_microusd_per_million=2_000_000)
    return l


def book(l, task="task-1", completion=1_000_000):
    return l.reserve("project-1",task,"agent-1","provider-a","model-a",
                     prompt_tokens=0,max_completion_tokens=completion)


def test_missing_budget_and_price_fail_closed(ledger):
    with pytest.raises(BudgetDenied,match="budget"):
        ledger.reserve("missing","t","a","provider-a","model-a",
                       prompt_tokens=10,max_completion_tokens=100)
    with pytest.raises(BudgetDenied,match="price"):
        ledger.reserve("project-1","t","a","provider-a","unpriced",
                       prompt_tokens=10,max_completion_tokens=100)


def test_reserve_caps_and_actual_usage_settlement(ledger):
    ident=book(ledger)
    assert ledger.summary("project-1")["committed_microusd"]==2_000_000
    value=ledger.settle(ident,{"prompt_tokens":100,"completion_tokens":500_000})
    assert value==1_000_100
    assert ledger.summary("project-1")["committed_microusd"]==1_000_100
    assert ledger.history("project-1")[0]["status"]=="settled"


def test_unknown_usage_retains_reservation_and_denies_success(ledger):
    ident=book(ledger)
    with pytest.raises(BudgetDenied,match="usage"):
        ledger.settle(ident,{})
    assert ledger.history("project-1")[0]["status"]=="unknown"
    assert ledger.summary("project-1")["committed_microusd"]==2_000_000
    with pytest.raises(BudgetDenied):
        ledger.settle(ident,{"prompt_tokens":1,"completion_tokens":2})


def test_explicit_transport_uncertainty_is_not_free(ledger):
    ident=book(ledger)
    assert ledger.mark_uncertain(ident,"timeout") is True
    assert ledger.mark_uncertain(ident,"timeout") is False
    assert ledger.summary("project-1")["committed_microusd"]==2_000_000


def test_overage_is_recorded_and_never_downgraded_to_success(ledger):
    ident=book(ledger,completion=100)
    with pytest.raises(BudgetDenied,match="exceeded"):
        ledger.settle(ident,{"prompt_tokens":10,"completion_tokens":101})
    record=ledger.history("project-1")[0]
    assert record["status"]=="overage"
    assert record["actual_microusd"]>=record["reserved_microusd"]


def test_cap_cannot_be_reduced_below_spent_and_held(ledger):
    book(ledger)
    with pytest.raises(BudgetDenied):
        ledger.set_budget("project-1",100,approved_by="owner")


def test_no_boolean_or_negative_accounting(ledger):
    with pytest.raises(ValueError):
        ledger.set_budget("p2",True,approved_by="owner")
    with pytest.raises(ValueError):
        ledger.set_price("p","m",input_microusd_per_million=-1,
                         output_microusd_per_million=1)
    with pytest.raises(ValueError):
        ledger.reserve("project-1","t","a","provider-a","model-a",
                       prompt_tokens=True,max_completion_tokens=1)


def test_simultaneous_requests_cannot_overspend(ledger):
    with ThreadPoolExecutor(max_workers=12) as pool:
        outcomes=list(pool.map(lambda i: _try_book(ledger,i),range(12)))
    assert sum(outcomes)==7  # 2M per call, 15M cap
    assert ledger.summary("project-1")["committed_microusd"]==14_000_000


def _try_book(ledger,i):
    try:
        book(ledger,task=f"task-{i}")
        return 1
    except BudgetDenied:
        return 0


def test_dollars_are_not_floats_and_secrets_never_exposed(ledger):
    ident=book(ledger)
    row=ledger.history("project-1")[0]
    assert row["id"]==ident
    assert all("api_key" not in k and "secret" not in k for k in row)
    assert type(ledger.summary("project-1")["remaining_microusd"]) is int
