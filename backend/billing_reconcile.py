"""Immutable operator-supplied invoice evidence. NEVER auto-release uncertain funds.

No provider network access. An operator entry is NOT proof that a genuine
invoice was checked; external invoice verification remains a production gate.
"""
from contextlib import closing
import re
from project_rbac import ident

_SHA = re.compile(r"[a-f0-9]{64}\Z")


class InvoiceConflict(PermissionError):
    pass


class InvoiceReconciliation:
    def __init__(self, ledger):
        self.ledger = ledger
        with closing(ledger._db()) as db:
            db.executescript("""
              CREATE TABLE IF NOT EXISTS wfs_invoice_lines(
                provider TEXT NOT NULL,
                invoice_line_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                call_id TEXT NOT NULL,
                billed_microusd INTEGER NOT NULL
                    CHECK(billed_microusd BETWEEN 0 AND 1000000000000),
                invoice_sha256 TEXT NOT NULL,
                approved_by TEXT NOT NULL,
                created_at REAL NOT NULL,
                PRIMARY KEY(provider,invoice_line_id));
              CREATE INDEX IF NOT EXISTS wfs_invoice_project
                ON wfs_invoice_lines(project_id,call_id);
            """)

    def add_local_evidence(self, *, project_id, call_id, provider,
                           invoice_line_id, billed_microusd, invoice_sha256,
                           approved_by):
        ids = tuple(ident(x) for x in (
            project_id,call_id,provider,invoice_line_id,approved_by))
        project_id,call_id,provider,invoice_line_id,approved_by=ids
        if (isinstance(billed_microusd,bool) or
                not isinstance(billed_microusd,int) or
                not 0<=billed_microusd<=10**12):
            raise ValueError("invalid exact invoice micro-USD")
        if not isinstance(invoice_sha256,str) or not _SHA.fullmatch(invoice_sha256):
            raise ValueError("full invoice evidence SHA256 required")
        values=(provider,invoice_line_id,project_id,call_id,
                billed_microusd,invoice_sha256,approved_by)
        db=self.ledger._db()
        try:
            db.execute("BEGIN IMMEDIATE")
            call=db.execute("SELECT project_id,provider FROM wfs_cost_calls WHERE id=?",
                            (call_id,)).fetchone()
            if not call or (call["project_id"],call["provider"])!=(project_id,provider):
                raise InvoiceConflict("invoice/call project or provider mismatch")
            prior=db.execute("""SELECT provider,invoice_line_id,project_id,call_id,
                               billed_microusd,invoice_sha256,approved_by
                               FROM wfs_invoice_lines WHERE provider=? AND invoice_line_id=?""",
                            (provider,invoice_line_id)).fetchone()
            if prior is not None:
                if tuple(prior)!=values:
                    raise InvoiceConflict("immutable invoice line conflict")
                changed=False
            else:
                db.execute("INSERT INTO wfs_invoice_lines VALUES(?,?,?,?,?,?,?,?)",
                           values+(float(self.ledger.clock()),))
                changed=True
            db.commit()
            return changed
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def report(self,project_id):
        project_id=ident(project_id)
        with closing(self.ledger._db()) as db:
            calls=db.execute("""SELECT id,provider,model,status,actual_microusd
                    FROM wfs_cost_calls WHERE project_id=? ORDER BY id""",
                    (project_id,)).fetchall()
            lines=db.execute("""SELECT call_id,billed_microusd FROM wfs_invoice_lines
                    WHERE project_id=? ORDER BY call_id""",(project_id,)).fetchall()
        bycall={}
        for row in lines:
            bycall.setdefault(row["call_id"],[]).append(row["billed_microusd"])
        results=[]
        for call in calls:
            invoice=bycall.get(call["id"],[])
            if call["status"] in ("reserved","unknown"):
                state="uncertain-charge"
            elif call["status"]=="overage":
                state="provider-overage"
            elif not invoice:
                state="invoice-missing"
            elif len(invoice)>1:
                state="invoice-ambiguous"
            elif invoice[0]!=call["actual_microusd"]:
                state="amount-mismatch"
            else:
                state="matched"
            results.append({
                "call_id":call["id"],"provider":call["provider"],
                "model":call["model"],"ledger_status":call["status"],
                "status":state,"provider_amount_microusd":call["actual_microusd"],
                "invoice_amount_microusd":sum(invoice) if invoice else None,
                "invoice_line_count":len(invoice)})
        return {"project_id":project_id,"calls":results,
                "matched":sum(x["status"]=="matched" for x in results),
                "requires_review":sum(x["status"]!="matched" for x in results),
                "provider_invoice_verified":False,"balance_changed":False}
