"""WFS AI provider cost ledger: approved hard caps and actual-usage settlement.

Accounting units: integer micro-USD (1 USD = 1_000_000 micro-USD).
Prices: micro-USD per 1,000,000 tokens, configured by an authorized operator.
NO assumed provider prices, NO external model calls, NO auto-approved budgets.
"""
from contextlib import contextmanager, closing
from pathlib import Path
import re
import sqlite3
import time
import uuid

_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}\Z")
_MAX = 10**15


class BudgetDenied(PermissionError):
    """A paid request must not be sent."""


def _id(value, label):
    if not isinstance(value, str) or not _ID.fullmatch(value):
        raise ValueError(f"invalid {label}")
    return value


def _positive(value, label, *, allow_zero=False):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{label} must be an integer")
    if value < (0 if allow_zero else 1) or value > _MAX:
        raise ValueError(f"{label} out of bounds")
    return value


def _cost(tokens_in, tokens_out, price_in, price_out):
    """Round up so fractional micro-USD cannot evade a budget."""
    return (tokens_in * price_in + tokens_out * price_out + 999999) // 1000000


class CostLedger:
    def __init__(self, db_path, clock=None):
        self.path = str(Path(db_path).resolve())
        self.clock = clock or time.time
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with closing(self._db()) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS wfs_cost_budgets(
                  project_id TEXT PRIMARY KEY,
                  cap_microusd INTEGER NOT NULL,
                  approved_by TEXT NOT NULL,
                  approved_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS wfs_cost_prices(
                  provider TEXT NOT NULL, model TEXT NOT NULL,
                  input_microusd_per_million INTEGER NOT NULL,
                  output_microusd_per_million INTEGER NOT NULL,
                  updated_at REAL NOT NULL,
                  PRIMARY KEY(provider,model)
                );
                CREATE TABLE IF NOT EXISTS wfs_cost_calls(
                  id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
                  task_id TEXT NOT NULL, agent_id TEXT NOT NULL,
                  provider TEXT NOT NULL, model TEXT NOT NULL,
                  status TEXT NOT NULL CHECK(status IN
                    ('reserved','settled','unknown','overage')),
                  prompt_reserved INTEGER NOT NULL,
                  completion_reserved INTEGER NOT NULL,
                  reserved_microusd INTEGER NOT NULL,
                  actual_prompt INTEGER, actual_completion INTEGER,
                  actual_microusd INTEGER,
                  detail TEXT,
                  created_at REAL NOT NULL, updated_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS wfs_cost_project
                  ON wfs_cost_calls(project_id,status);
            """)

    def _db(self):
        conn = sqlite3.connect(self.path, timeout=20, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=20000")
        return conn

    @contextmanager
    def _tx(self):
        conn = self._db()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def set_budget(self, project_id, cap_microusd, *, approved_by):
        """Privileged operator method; NEVER expose directly as public API."""
        p = _id(project_id, "project_id")
        approver = _id(approved_by, "approved_by")
        cap = _positive(cap_microusd, "cap_microusd", allow_zero=True)
        now = float(self.clock())
        with self._tx() as db:
            committed = self._committed(db, p)
            if cap < committed:
                raise BudgetDenied("new cap is below spent and reserved money")
            db.execute("""INSERT INTO wfs_cost_budgets VALUES(?,?,?,?)
                ON CONFLICT(project_id) DO UPDATE SET
                cap_microusd=excluded.cap_microusd,
                approved_by=excluded.approved_by,
                approved_at=excluded.approved_at""",
                (p, cap, approver, now))

    def set_price(self, provider, model, *, input_microusd_per_million,
                  output_microusd_per_million):
        provider, model = _id(provider, "provider"), _id(model, "model")
        pi = _positive(input_microusd_per_million, "input_price")
        po = _positive(output_microusd_per_million, "output_price")
        with self._tx() as db:
            previous = db.execute("""SELECT input_microusd_per_million,
                output_microusd_per_million FROM wfs_cost_prices
                WHERE provider=? AND model=?""",(provider,model)).fetchone()
            if previous and (previous[0], previous[1]) != (pi,po):
                pending = db.execute("""SELECT COUNT(*) FROM wfs_cost_calls
                    WHERE provider=? AND model=? AND status='reserved'""",
                    (provider,model)).fetchone()[0]
                if pending:
                    raise BudgetDenied("cannot reprice model while calls are reserved")
            db.execute("""INSERT INTO wfs_cost_prices VALUES(?,?,?,?,?)
                ON CONFLICT(provider,model) DO UPDATE SET
                input_microusd_per_million=excluded.input_microusd_per_million,
                output_microusd_per_million=excluded.output_microusd_per_million,
                updated_at=excluded.updated_at""",
                (provider, model, pi, po, float(self.clock())))

    @staticmethod
    def _committed(db, project):
        result = db.execute("""SELECT COALESCE(SUM(
            CASE WHEN status='settled' THEN actual_microusd
                 WHEN status='overage' THEN MAX(reserved_microusd,actual_microusd)
                 ELSE reserved_microusd END
            ),0) FROM wfs_cost_calls WHERE project_id=?""", (project,)).fetchone()
        return int(result[0])

    def reserve(self, project_id, task_id, agent_id, provider, model, *,
                prompt_tokens, max_completion_tokens):
        """Atomic approved budget check BEFORE contacting an AI provider."""
        p = _id(project_id, "project_id")
        t = _id(task_id, "task_id")
        a = _id(agent_id, "agent_id")
        provider, model = _id(provider, "provider"), _id(model, "model")
        ti = _positive(prompt_tokens, "prompt_tokens", allow_zero=True)
        to = _positive(max_completion_tokens, "max_completion_tokens")
        now = float(self.clock())
        with self._tx() as db:
            row = db.execute("SELECT cap_microusd FROM wfs_cost_budgets WHERE project_id=?", (p,)).fetchone()
            if row is None:
                raise BudgetDenied("no approved project budget")
            rate = db.execute("""SELECT input_microusd_per_million,
                output_microusd_per_million FROM wfs_cost_prices
                WHERE provider=? AND model=?""", (provider, model)).fetchone()
            if rate is None:
                raise BudgetDenied("provider/model price is not configured")
            reserve_cost = _cost(ti, to, rate[0], rate[1])
            if reserve_cost > _MAX:
                raise BudgetDenied("request reservation exceeds accounting limit")
            if self._committed(db, p) + reserve_cost > row[0]:
                raise BudgetDenied("project hard spending cap reached")
            ident = "call-" + uuid.uuid4().hex
            db.execute("""INSERT INTO wfs_cost_calls(
                  id, project_id, task_id, agent_id, provider, model, status,
                  prompt_reserved, completion_reserved, reserved_microusd,
                  created_at, updated_at)
                VALUES(?,?,?,?,?,?,'reserved',?,?,?,?,?)""",
                (ident,p,t,a,provider,model,ti,to,reserve_cost,now,now))
            return ident

    def settle(self, call_id, usage):
        """Only actual provider usage can clear a reservation.

        Missing usage or out-of-reservation usage is uncertain/overage,
        not a free request. Uncertain calls keep funds held.
        """
        call_id = _id(call_id, "call_id")
        if not isinstance(usage, dict) or not isinstance(usage.get("prompt_tokens"), int) or not isinstance(usage.get("completion_tokens"), int) or any(isinstance(usage.get(k), bool) or usage.get(k) < 0 for k in ("prompt_tokens","completion_tokens") if isinstance(usage.get(k), int)):
            self.mark_uncertain(call_id, "provider did not supply valid token usage")
            raise BudgetDenied("provider usage missing or invalid; funds held")
        tokens_in, tokens_out = usage["prompt_tokens"], usage["completion_tokens"]
        _positive(tokens_in, "prompt_tokens", allow_zero=True)
        _positive(tokens_out, "completion_tokens", allow_zero=True)
        now = float(self.clock())
        with self._tx() as db:
            row = db.execute("SELECT * FROM wfs_cost_calls WHERE id=?", (call_id,)).fetchone()
            if row is None or row["status"] != "reserved":
                raise BudgetDenied("reservation missing or already accounted for")
            rate = db.execute("""SELECT input_microusd_per_million,output_microusd_per_million
                FROM wfs_cost_prices WHERE provider=? AND model=?""",
                (row["provider"], row["model"])).fetchone()
            if rate is None:
                raise BudgetDenied("price missing during settlement")
            actual = _cost(tokens_in,tokens_out,rate[0],rate[1])
            over = (tokens_in > row["prompt_reserved"] or
                    tokens_out > row["completion_reserved"] or
                    actual > row["reserved_microusd"])
            status = "overage" if over else "settled"
            db.execute("""UPDATE wfs_cost_calls SET status=?,
                actual_prompt=?,actual_completion=?,actual_microusd=?,
                detail=?,updated_at=? WHERE id=?""",
                (status,tokens_in,tokens_out,actual,
                 "provider exceeded reservation; investigate" if over else None,
                 now,call_id))
            if over:
                raise_after = True
            else:
                raise_after = False
        if raise_after:
            raise BudgetDenied("provider usage exceeded reserved maximum")
        return actual

    def mark_uncertain(self, call_id, detail="provider request outcome unknown"):
        call_id = _id(call_id, "call_id")
        with self._tx() as db:
            cur = db.execute("""UPDATE wfs_cost_calls SET status='unknown',
                detail=?,updated_at=? WHERE id=? AND status='reserved'""",
                (str(detail)[:250],float(self.clock()),call_id))
            return cur.rowcount == 1

    def summary(self, project_id):
        project_id = _id(project_id, "project_id")
        with closing(self._db()) as db:
            b = db.execute("SELECT cap_microusd FROM wfs_cost_budgets WHERE project_id=?",
                           (project_id,)).fetchone()
            if b is None:
                return {"approved":False,"cap_microusd":0,
                        "committed_microusd":0,"remaining_microusd":0}
            used = self._committed(db, project_id)
            return {"approved":True,"cap_microusd":int(b[0]),
                    "committed_microusd":used,
                    "remaining_microusd":max(0,int(b[0])-used)}

    def history(self, project_id, *, limit=100):
        p = _id(project_id, "project_id")
        if isinstance(limit, bool) or not isinstance(limit,int) or not 1<=limit<=500:
            raise ValueError("invalid limit")
        with closing(self._db()) as db:
            rows = db.execute("""SELECT id, project_id,task_id,agent_id,
                  provider,model,status,prompt_reserved,completion_reserved,
                  actual_prompt,actual_completion,reserved_microusd,
                  actual_microusd,detail,created_at,updated_at
                  FROM wfs_cost_calls WHERE project_id=?
                  ORDER BY created_at DESC,id DESC LIMIT ?""",(p,limit)).fetchall()
            return [dict(x) for x in rows]
