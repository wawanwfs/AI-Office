#!/usr/bin/env python3
"""Audit eksposur datastore saas-dibantuin: postgres (db) & redis (siklus 220).

Read-only / berdampak-nol: hanya `ss`, probe TCP loopback, `docker inspect`,
`docker exec redis-cli ping` & `pg_isready` — tidak ada mutasi data.

Menegakkan hasil audit 2026-11-02 (backlog 219e):
  1. db & redis TIDAK mem-publish port ke host sama sekali
     (NetworkSettings.Ports["5432|6379/tcp"] = null, PortBindings kosong) —
     hanya backend/admin/widget yang dipublish, semuanya bind 127.0.0.1.
  2. Tidak ada listener :5432/:6379 di host (ss), TCP loopback ditolak.
  3. Compose source: db/redis tanpa deklarasi `ports:`; backend tetap
     "127.0.0.1:8000:8000" (loopback-only, siklus 163).
  4. Kedua datastore hidup & terjangkau HANYA dari dalam network docker
     (redis-cli ping = PONG, pg_isready = accepting) — validasi bahwa
     service nyata berjalan sehingga audit tidak false-pass pada stack mati.
Catatan INFO (bukan FAIL): redis requirepass kosong & postgres password dev
("dibantuin_dev") — tidak masalah selama network-isolated; menjadi gap bila
suatu saat port-nya dipublish.

Exit 0 = semua PASS; exit 1 = ada gap (regresi eksposur).
"""

import json
import re
import socket
import subprocess
import sys

COMPOSE = "/home/agentuser/wfs-office/saas-dibantuin/docker-compose.yml"
DB = "saas-dibantuin-db-1"
REDIS = "saas-dibantuin-redis-1"
BACKEND = "saas-dibantuin-backend-1"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def tcp_refused(port, host="127.0.0.1", timeout=5):
    """True bila koneksi DITOLAK (tidak ada listener); False bila terbuka/gagal aneh."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        return False  # terbuka — buruk
    except ConnectionRefusedError:
        return True  # ditolak — aman
    except OSError:
        return False  # timeout/unreachable — state tidak jelas, anggap gagal
    finally:
        s.close()


# 1-2. compose source ada & backend tetap loopback-only (anchor)
try:
    src = open(COMPOSE, encoding="utf-8").read()
    check(f"compose source ada: {COMPOSE}", True)
    check('compose: backend "127.0.0.1:8000:8000" (loopback-only)',
          '127.0.0.1:8000:8000' in src)
except OSError as e:
    src = ""
    check(f"compose source ada: {COMPOSE}", False, str(e))
    check('compose: backend "127.0.0.1:8000:8000" (loopback-only)', False, "compose tidak terbaca")

# 3. compose: TIDAK ada deklarasi publish 5432/6379 di mana pun
leak = re.findall(r'^\s*-\s*"?\d[\d.]*:(5432|6379)\b.*$', src, re.M)
check("compose: 0 deklarasi ports 5432/6379", not leak, f"ketemu={leak}")

# 4-5. ss: tidak ada listener host di 5432/6379 (interface apa pun)
ss = subprocess.run(["ss", "-tlnp"], capture_output=True, text=True, timeout=20).stdout
l5 = [l for l in ss.splitlines() if ":5432" in l]
l6 = [l for l in ss.splitlines() if ":6379" in l]
check("ss: 0 listener host :5432", not l5, f"{l5[:1]}")
check("ss: 0 listener host :6379", not l6, f"{l6[:1]}")

# 6-7. TCP loopback ditolak (bukti runtime, bukan hanya config)
check("TCP 127.0.0.1:5432 ditolak", tcp_refused(5432))
check("TCP 127.0.0.1:6379 ditolak", tcp_refused(6379))

# 8-10. docker inspect: Ports null + PortBindings kosong utk db/redis;
# backend tetap bind 127.0.0.1 (validasi kita mengaudit stack yang benar)
try:
    insp = json.loads(subprocess.run(
        ["docker", "inspect", DB, REDIS, BACKEND],
        capture_output=True, text=True, timeout=30,
    ).stdout)
    by_name = {c["Name"].lstrip("/"): c for c in insp}

    def ports(name, key):
        p = by_name[name]["NetworkSettings"]["Ports"].get(key)
        return p  # None = tidak dipublish

    check(f"{DB}: Ports['5432/tcp'] = null (tidak dipublish)",
          ports(DB, "5432/tcp") is None)
    check(f"{REDIS}: Ports['6379/tcp'] = null (tidak dipublish)",
          ports(REDIS, "6379/tcp") is None)

    pb_db = by_name[DB]["HostConfig"]["PortBindings"]
    pb_rd = by_name[REDIS]["HostConfig"]["PortBindings"]
    check("PortBindings db & redis kosong", not pb_db and not pb_rd,
          f"db={pb_db} redis={pb_rd}")
    pb_be = by_name[BACKEND]["HostConfig"]["PortBindings"].get("8000/tcp") or []
    check(f"{BACKEND} HostPort = 127.0.0.1 (loopback)",
          any(b.get("HostIp") == "127.0.0.1" for b in pb_be), f"{pb_be}")
except Exception as e:  # noqa: BLE001 — probe docker
    check(f"{DB}: Ports['5432/tcp'] = null (tidak dipublish)", False, f"probe gagal: {e}")
    check(f"{REDIS}: Ports['6379/tcp'] = null (tidak dipublish)", False, f"probe gagal: {e}")
    check("PortBindings db & redis kosong", False, f"probe gagal: {e}")
    check(f"{BACKEND} HostPort = 127.0.0.1 (loopback)", False, f"probe gagal: {e}")

# 11-12. datastore hidup HANYA di dalam network docker (validasi stack hidup)
rp = subprocess.run(
    ["docker", "exec", REDIS, "redis-cli", "ping"],
    capture_output=True, text=True, timeout=20,
)
check("redis hidup in-network (redis-cli ping = PONG)",
      rp.returncode == 0 and "PONG" in rp.stdout, (rp.stdout or rp.stderr).strip()[:60])
pg = subprocess.run(
    ["docker", "exec", DB, "pg_isready", "-U", "dibantuin"],
    capture_output=True, text=True, timeout=20,
)
check("postgres hidup in-network (pg_isready = accepting)",
      pg.returncode == 0 and "accepting" in pg.stdout, (pg.stdout or pg.stderr).strip()[:60])

# INFO (bukan FAIL) — kelemahan auth internal, aman selama network-isolated
try:
    rq = subprocess.run(
        ["docker", "exec", REDIS, "redis-cli", "CONFIG", "GET", "requirepass"],
        capture_output=True, text=True, timeout=20,
    ).stdout
    val = rq.splitlines()[-1].strip() if rq.strip() else "?"
    print(f"[INFO] redis requirepass = {'(kosong)' if val == '' else val}"
          " — aman selama tanpa published port (network-isolated)")
except Exception as e:  # noqa: BLE001
    print(f"[INFO] redis requirepass tidak terprobe: {e}")
print("[INFO] postgres password = dev default (dibantuin_dev) dari compose env — "
      "aman selama tanpa published port; wajib diganti bila suatu saat dipublish")

failed = [r for r in results if not r[1]]
print(f"\nAudit datastore saas-dibantuin (postgres/redis): "
      f"{len(results) - len(failed)}/{len(results)} PASS")
sys.exit(1 if failed else 0)
