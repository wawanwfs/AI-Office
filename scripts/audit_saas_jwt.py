#!/usr/bin/env python3
"""Audit JWT coverage backend saas-dibantuin :8000 (siklus 219).

Read-only / berdampak-nol: semua probe loopback 127.0.0.1, tidak ada mutasi
data (login memakai kredensial SALAH yang pasti ditolak; tidak ada snapshot
DB yang berisiko). Menegakkan hasil audit 2026-11-02:
  1. Bind loopback-only: 127.0.0.1:8000 ada, 0.0.0.0:8000 TIDAK ada.
  2. Semua /api/admin/* (GET/POST/DELETE) = 401 tanpa token.
  3. 401 dengan token palsu (bukan 200/500).
  4. POST /api/auth/login kredensial salah = 401.
  5. /api/health = 200 (audit valid hanya bila service hidup).
  6. Proxy :9503 /api/admin/stats meneruskan 401 (tidak bypass).
  7. JWT_SECRET live container >= 32 char (panjang saja, nilai tak pernah
     dibaca/dicetak).
Exit 0 = semua PASS; exit 1 = ada gap (regresi otentikasi).
"""

import json
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
PROXY = "http://127.0.0.1:9503"
ADMIN_EPS = [
    ("GET", "/api/admin/stats"),
    ("GET", "/api/admin/tenants"),
    ("GET", "/api/admin/conversations"),
    ("GET", "/api/admin/knowledge"),
    ("POST", "/api/admin/chat"),
    ("DELETE", "/api/admin/knowledge/audit-probe-tidak-ada"),
]
FAKE = "Bearer eyJhbGciOiJIUzI1NiJ9.audits.auditprobe"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def req(method, url, headers=None, body=None, timeout=15):
    r = urllib.request.Request(url, method=method, data=body)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read(300)
    except urllib.error.HTTPError as e:
        return e.code, e.read(300)
    except Exception as e:  # noqa: BLE001 — probe jaringan
        return None, str(e).encode()


# 5. service hidup dulu — tanpa ini hasil audit tidak valid
code, _ = req("GET", f"{BASE}/api/health")
check("health :8000 = 200", code == 200, f"got {code}")

# 1. bind loopback-only
ss = subprocess.run(["ss", "-tlnp"], capture_output=True, text=True, timeout=20).stdout
loop = any(":8000" in l and "127.0.0.1:8000" in l for l in ss.splitlines())
wild = any(":8000" in l and "0.0.0.0:8000" in l for l in ss.splitlines())
check("bind loopback-only (127.0.0.1 ada, 0.0.0.0 tidak)", loop and not wild,
      f"loop={loop} wild={wild}")

# 2. semua /api/admin/* tanpa token = 401
for method, ep in ADMIN_EPS:
    code, body = req(method, f"{BASE}{ep}")
    check(f"{method} {ep} tanpa token = 401", code == 401,
          f"got {code} {body[:80]!r}")

# 3. token palsu = 401
code, body = req("GET", f"{BASE}/api/admin/stats", headers={"Authorization": FAKE})
check("GET /api/admin/stats token palsu = 401", code == 401, f"got {code}")

# 4. login kredensial salah = 401
code, body = req(
    "POST", f"{BASE}/api/auth/login",
    headers={"Content-Type": "application/json"},
    body=json.dumps({"username": "audit-probe", "password": "audit-salah-xyz"}).encode(),
)
check("login kredensial salah = 401", code == 401, f"got {code}")

# 6. proxy :9503 tidak bypass otentikasi backend
code, _ = req("GET", f"{PROXY}/api/admin/stats")
check("proxy :9503 /api/admin/stats tanpa token = 401", code == 401, f"got {code}")

# 7. panjang JWT_SECRET live container (nilai TIDAK dibaca)
try:
    out = subprocess.run(
        ["docker", "exec", "saas-dibantuin-backend-1", "sh", "-c",
         'echo -n "$JWT_SECRET" | wc -c'],
        capture_output=True, text=True, timeout=20,
    )
    n = int(out.stdout.strip() or 0)
    check("JWT_SECRET live >= 32 char", n >= 32, f"len={n}")
except Exception as e:  # noqa: BLE001
    check("JWT_SECRET live >= 32 char", False, f"probe gagal: {e}")

failed = [r for r in results if not r[1]]
print(f"\nAudit saas-dibantuin :8000: {len(results) - len(failed)}/{len(results)} PASS")
sys.exit(1 if failed else 0)
