# ===== MENU & HARGA untuk AI CS (chat sys_prompt) =====
# Sumber: katalog di kantor (menu board) + orders.db
import re, sqlite3, os

MENU = [
    {"nama": "Kopi Susu Gula Aren", "harga": 18000},
    {"nama": "Americano", "harga": 15000},
    {"nama": "Cappuccino", "harga": 22000},
    {"nama": "Matcha Latte", "harga": 22000},
    {"nama": "Es Teh Manis", "harga": 8000},
    {"nama": "Croissant Butter", "harga": 18000},
]

def menu_text() -> str:
    return "; ".join(f"{m['nama']} Rp{m['harga']:,}" for m in MENU)

def order_lookup(message: str) -> str:
    m = re.search(r"\b(10\d{2})\b", message)
    if not m:
        return ""
    oid = int(m.group(1))
    db_path = os.environ.get("ORDERS_DB", "/wfs-data/orders.db")
    try:
        c = sqlite3.connect(db_path, timeout=3)
        row = c.execute("SELECT id,customer,items,total,status,courier,resi,eta FROM orders WHERE id=?", (oid,)).fetchone()
        c.close()
        if not row:
            return f"Order #{oid} TIDAK ditemukan."
        return (f"DATA ORDER #{row[0]}: pelanggan={row[1]}, item={row[2]}, total=Rp{row[3]:,}, "
                f"status={row[4]}, kurir={row[5] or '-'}, resi={row[6] or '-'}, estimasi={row[7] or '-'}.")
    except Exception as e:
        return f"(cek order gagal: {e})"

def build_system_prompt(tenant_id: int, message: str) -> str:
    # Knowledge base dinamis dari DB (fallback: MENU default)
    kb_txt = ""
    try:
        from app.core.database import SessionLocal
        from app.models.knowledge import KnowledgeEntry
        s = SessionLocal()
        rows = s.query(KnowledgeEntry).filter(KnowledgeEntry.tenant_id == tenant_id).all()
        s.close()
        if rows:
            kb_txt = "; ".join(f"{e.key}: {e.value}" for e in rows)
    except Exception:
        pass
    menu_part = f"KNOWLEDGE BASE: {kb_txt}" if kb_txt else f"DAFTAR MENU & HARGA: {menu_text()}"
    p = ("Kamu AI customer service 'dibantuin', ramah, jawab singkat Bahasa Indonesia. "
         f"{menu_part}. "
         "Jawab pertanyaan produk/harga dari informasi di atas. "
         "Kalau ada DATA ORDER di bawah gunakan untuk jawab status pesanan; "
         "kalau ditanya pesanan tanpa nomor, minta nomor order.")
    ctx = order_lookup(message)
    if ctx:
        p += f"\n\n{ctx}"
    return p
