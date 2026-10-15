"""
WFS Virtual Office — Order service untuk dibantuin.com
Simulasi database order (SQLite) yang bisa di-query AI CS.
"""
import sqlite3, json, time, pathlib, os
from fastapi import APIRouter
from pydantic import BaseModel

DB = pathlib.Path(__file__).parent / "orders.db"
router = APIRouter(prefix="/api/orders")

def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS orders(
            id INTEGER PRIMARY KEY,
            customer TEXT, items TEXT, total INTEGER,
            status TEXT, courier TEXT, resi TEXT, eta TEXT, created REAL);
        """)
        if c.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 0:
            seed = [
                (1024, "Bu Sari", '[{"nama":"Kopi Susu Gula Aren","qty":2,"harga":18000}]', 36000,
                 "DIKIRIM", "JNE", "JNE123456789", "besok pagi", time.time()-86400),
                (1025, "Pak Budi", '[{"nama":"Americano","qty":1,"harga":15000}]', 15000,
                 "DIPROSES", None, None, "2 hari", time.time()-3600),
                (1026, "Dewi", '[{"nama":"Matcha Latte","qty":3,"harga":20000}]', 60000,
                 "SELESAI", "Gojek", "GO-8871", "-", time.time()-172800),
            ]
            c.executemany("INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?)", seed)

init()

class OrderIn(BaseModel):
    customer: str
    items: list  # [{nama, qty, harga}]
    status: str = "DIPROSES"

@router.get("/{order_id}")
def get_order(order_id: int):
    with db() as c:
        r = c.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    if not r:
        return {"ok": False, "error": f"Order #{order_id} tidak ditemukan"}
    return {"ok": True, "order": dict(r)}

@router.get("")
@router.get("/")
def list_orders():
    with db() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()]
    return {"ok": True, "orders": rows}

@router.post("")
@router.post("/")
def create_order(o: OrderIn):
    with db() as c:
        cur = c.execute("SELECT COALESCE(MAX(id),1000)+1 FROM orders", ()).fetchone()
        oid = cur[0]
        total = sum(i.get("harga", 0) * i.get("qty", 1) for i in o.items)
        c.execute("INSERT INTO orders(id,customer,items,total,status,created) VALUES(?,?,?,?,?,?)",
                  (oid, o.customer, json.dumps(o.items), total, o.status, time.time()))
    return {"ok": True, "order_id": oid, "total": total}

@router.get("/lookup/text")
def lookup(q: str):
    """Untuk AI CS: parse nomor order dari pertanyaan customer."""
    import re
    m = re.search(r"#?(\d{3,5})", q)
    if not m:
        return {"ok": False, "error": "Tidak ada nomor order di pertanyaan"}
    return get_order(int(m.group(1)))
