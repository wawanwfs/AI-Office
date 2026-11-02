#!/usr/bin/env python3
"""Audit konsistensi HEAD vs GET pada seluruh front HTTP loopback (siklus 226).

Latar (audit live 2026-11-02):
- Siklus 222/223/224/225 menyemakaikan HEAD dgn GET untuk :9503
  (wfs_hq_server.py). :3000 (admin Next.js) & :3001 (widget) sudah
  konsisten native.
- :8000 (backend saas-dibantuin, FastAPI) TIDAK: setiap rute GET
  menjawab HEAD 405 (FastAPI APIRoute tak mendaftarkan HEAD otomatis),
  padahal GET /api/health = 200 json 51 B. Monitor/uptime-probe berbasis HEAD
  menerima "service down" palsu. Diperbaiki di sisi app
  (backend/app/http_head_mirror.py: replay HEAD -> GET).
- :8787 (gateway produksi wfs-office, superset backend_live/wfs_server.py)
  punya defek yang SAMA (FastAPI) — ditemukan & diperbaiki siklus 227
  dgn HeadMirrorMiddleware langsung di superset; SSE /api/events
  dikecualikan (GET streaming tanpa ujung — kontrak 404 :9503 tidak
  berlaku di sini, HEAD = 405 asli).

Script ini READ-ONLY (tak menulis apa pun ke layanan) dan memeriksa
invarian: untuk setiap path, HEAD harus memberi status + Content-Type +
Content-Length yang sama dengan GET (Content-Length wajib sama karena
payload tidak berubah; body HEAD wajib kosong). Path SSE dikecualikan.

Exit 0 = semua PASS. Exit 1 = ada FAIL.
"""

import sys
import urllib.error
import urllib.request

TMO = 8

# (base, path, catatan)
TARGETS = [
    ("http://127.0.0.1:9503", "/", "halaman utama :9503 (injeksi token)"),
    ("http://127.0.0.1:9503", "/app/", "SPA :9503"),
    ("http://127.0.0.1:9503", "/api/tasks", "api_service via :9503"),
    ("http://127.0.0.1:9503", "/wfs-api/tasks", "gateway :8787 via :9503"),
    ("http://127.0.0.1:9503", "/wfs-project", "project_api via :9503"),
    ("http://127.0.0.1:9503", "/admin/", "panel :3000 via :9503"),
    ("http://127.0.0.1:9503", "/api/admin/stats", "backend :8000 via :9503 (401)"),
    ("http://127.0.0.1:9503", "/server.py", "kontrak allowlist: tetap 404"),
    ("http://127.0.0.1:8787", "/api/health", "gateway :8787 (HEAD mirror siklus 227)"),
    ("http://127.0.0.1:8787", "/api/status", "status gateway (disk/mem anti-poisoning)"),
    ("http://127.0.0.1:8787", "/api/agents", "daftar 15 agen"),
    ("http://127.0.0.1:8787", "/api/tasks", "daftar task engine"),
    ("http://127.0.0.1:8787", "/api/tasks/paused", "pause persisten (harus 200)"),
    ("http://127.0.0.1:8787", "/api/orders", "router orders (dibantuin)"),
    ("http://127.0.0.1:8787", "/api/dashboard/stats", "router dashboard stats"),
    ("http://127.0.0.1:8787", "/nope", "path asing tetap 404 asli"),
    ("http://127.0.0.1:8000", "/api/health", "health backend saas-dibantuin"),
    ("http://127.0.0.1:8000", "/docs", "swagger native Starlette"),
    ("http://127.0.0.1:8000", "/openapi.json", "skema OpenAPI"),
    ("http://127.0.0.1:8000", "/api/admin/stats", "rute auth-only (401)"),
    ("http://127.0.0.1:8000", "/api/admin/tenants", "rute auth-only (401)"),
    ("http://127.0.0.1:3000", "/", "panel admin Next.js langsung"),
    ("http://127.0.0.1:3001", "/", "widget CS langsung"),
]

# Rute streaming: HEAD sengaja bukan cermin GET (GET tak pernah selesai).
SKIP_PREFIX = ("/api/events", "/wfs-api/events")


def fetch(base, path, method):
    req = urllib.request.Request(base + path, method=method)
    req.add_header("Accept-Encoding", "identity")  # CL mentah, bukan gzip
    try:
        with urllib.request.urlopen(req, timeout=TMO) as r:
            body = r.read() if method == "GET" else b""
            return r.status, r.headers, body
    except urllib.error.HTTPError as e:
        body = e.read() if method == "GET" else b""
        return e.code, e.headers, body
    except Exception as e:  # koneksi mati dsb.
        return None, {"x-error": str(e)}, b""


def norm_ct(h):
    return (h.get("Content-Type") or "").strip().lower()


def norm_cl(h):
    v = h.get("Content-Length")
    return int(v) if v and v.isdigit() else None


def main():
    rows = []
    fails = []
    for base, path, note in TARGETS:
        if path.startswith(SKIP_PREFIX):
            continue
        gs, gh, gb = fetch(base, path, "GET")
        hs, hh, hb = fetch(base, path, "HEAD")
        if gs is None or hs is None:
            fails.append(f"{base}{path}: koneksi gagal GET={gs} HEAD={hs} ({hh.get('x-error')})")
            rows.append((base, path, "CONN-FAIL", gs, hs, "-", "-"))
            continue
        ok_status = gs == hs
        ok_ct = norm_ct(gh) == norm_ct(hh)
        ok_cl = norm_cl(gh) == norm_cl(hh)
        ok_nobody = hb == b""
        ok = ok_status and ok_ct and ok_cl and ok_nobody
        detail = []
        if not ok_status:
            detail.append(f"status GET={gs} HEAD={hs}")
        if not ok_ct:
            detail.append(f"CT GET={norm_ct(gh)!r} HEAD={norm_ct(hh)!r}")
        if not ok_cl:
            detail.append(f"CL GET={norm_cl(gh)} HEAD={norm_cl(hh)}")
        if not ok_nobody:
            detail.append(f"HEAD membawa body {len(hb)} B")
        rows.append(
            (
                base,
                path,
                "PASS" if ok else "FAIL",
                gs,
                hs,
                f"{norm_cl(gh)}/{norm_cl(hh)}",
                "; ".join(detail) or f"len(GET body)={len(gb)}",
            )
        )
        if not ok:
            fails.append(f"{base}{path}: " + "; ".join(detail))

    for base, path, verdict, gs, hs, cl, extra in rows:
        print(f"[{verdict}] {base}{path}  GET={gs} HEAD={hs} CL GET/HEAD={cl}  {extra}")

    print(f"\n{len(rows) - len(fails)}/{len(rows)} PASS")
    if fails:
        print("\nGAGAL:")
        for f in fails:
            print(" -", f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
