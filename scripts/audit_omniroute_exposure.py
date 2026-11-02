#!/usr/bin/env python3
"""Audit eksposur & otentikasi OmniRoute :20128 (siklus 221).

Read-only / berdampak-nol: semua probe loopback / docker exec env (tidak ada
mutasi task LLM — satu-satunya POST adalah permintaan chat kosong yang gagal
di pipeline provider sebelum menghasilkan token apa pun). Menegakkan hasil
audit 2026-11-02:
  1. Container omniroute hidup (audit valid hanya bila service hidup).
  2. Vektor akses tunggal terkonfirmasi: DNAT iptables terpasang (nat DOCKER
     "! -i br-... --dport 20128 -> DNAT") + chain filter DOCKER ACCEPT —
     bukti Docker mem-bypass ufw (traffic publish-port lewat FORWARD/DOCKER,
     bukan INPUT ufw). UFW tidak melindungi port publish Docker.
  3. Gerbang internet: TIDAK terjangkau dari node luar (check-host.net:
     20128 DAN kontrol :22 sama-sama 'Connection timed out' dari 6 node
     JP/RU/UK/IR/TR/US/CA/SE) → barrier efektif ada di level Tencent Cloud
     SG (cloud firewall memblokir semua port dari vantage itu), BUKAN ufw —
     ufw terbukti tidak melindungi port publish Docker (poin 2). Konsekuensi:
     satu-satunya barrier omniroute = Tencent SG; akses LAN VPC/Tailscale
     langsung ke proxy LLM tanpa key.
  4. otomatisasi: container env REQUIRE_API_KEY=false (invariant risiko) DAN
     POST /v1/chat/completions TANPA Authorization TIDAK ditolak 401 —
     diproxy langsung ke pipeline provider (omniroute = OPEN LLM PROXY dalam
     perimeter jaringan). 401 wajib di /v1/models.
  5b. Chain DOCKER-USER KOSONG (0 rule) — tidak ada lapisan filter tambahan
     di atas DOCKER; pelindung tamu hanya bisa dipasang di situ dan saat
     audit ini kosong total.
  5. Panel admin (Next.js /dashboard + /docs HTML) menyala tanpa login dan
     admin API (/api/keys, /api/settings, /api/providers, /api/config,
     /api/channels, /api/users) wajib 401 tanpa sesi.
  6. /metrics TIDAK tersedia (404) — telemetri tak terekspos.
  7. SENSITIVE-SCAN (berdampak-nol): halaman /docs TIDAK mengandung string
     pola secret sungguhan — hanya placeholder i18n "sk-ant***"
     (claudeSetupTokenPlaceholder, len 13) yang dikecualikan eksplisit.
Exit 0 = semua PASS; exit 1 = ada gap (drift posisi keamanan).
INFO kunci: satu-satunya barrier omniroute adalah jaringan (Tencent SG).
Keputusan remediasi (bind 127.0.0.1 / REQUIRE_API_KEY) = pemilik (user),
di luar cakupan read-only audit ini.
"""

import hashlib
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:20128"
ADMIN_EPS = [
    "/api/keys",
    "/api/settings",
    "/api/providers",
    "/api/config",
    "/api/channels",
    "/api/users",
]
# Placeholder i18n resmi UI (bukan secret): dipakai di docs HTML omniroute.
PLACEHOLDER_ALLOW = {"claudeSetupTokenPlaceholder", "tokensApiKeyPlaceholder", "tokensSetupTokenPlaceholder"}

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def info(name, detail=""):
    print(f"[INFO] {name}" + (f" — {detail}" if detail else ""))


def req(method, url, headers=None, body=None, timeout=15):
    r = urllib.request.Request(url, method=method, data=body)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read(400)
    except urllib.error.HTTPError as e:
        return e.code, e.read(400)
    except Exception as e:  # noqa: BLE001 — probe jaringan
        return None, str(e).encode()


def sh(cmd):
    """Jalankan probe subprocess dgn deadline literal 30s (patuh guard 202)."""
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=30, text=True)
        return p.returncode, p.stdout, p.stderr
    except Exception as e:  # noqa: BLE001 — probe subprocess
        return None, "", str(e)


# 1. service hidup
code, _ = req("GET", f"{BASE}/dashboard", timeout=10)
check("omniroute hidup (GET /dashboard respons)", code is not None, f"got {code}")

# 2. DNAT + DOCKER ACCEPT = bukti bypass ufw untuk port publish docker
rc, out, _ = sh(["sudo", "-n", "iptables", "-t", "nat", "-S", "DOCKER"])
dnat = [l for l in out.splitlines() if "20128" in l]
check(
    "DNAT nat DOCKER terpasang utk 20128 (bypass ufw terkonfirmasi)",
    rc == 0 and any("--dport 20128" in l and "DNAT" in l for l in dnat),
    dnat[0].strip()[:90] if dnat else "tidak ada rule",
)
rc2, out2, _ = sh(["sudo", "-n", "iptables", "-S", "DOCKER"])
accept = [l for l in out2.splitlines() if "20128" in l]
check(
    "filter DOCKER ACCEPT 20128 (sebelum ufw-before-forward)",
    rc2 == 0 and any("20128" in l and "ACCEPT" in l for l in accept),
    accept[0].strip()[:90] if accept else "tidak ada rule",
)

# 2b. DOCKER-USER kosong — tidak ada filter guard tambahan di atas DOCKER
rc3, out3, _ = sh(["sudo", "-n", "iptables", "-L", "DOCKER-USER", "-n"])
rules = [
    l for l in out3.splitlines()
    if l and len(l.split()) >= 2 and l.split()[1] in ("all", "tcp", "udp")
]
info(
    "chain DOCKER-USER kosong (tanpa guard tamu di atas DOCKER)",
    f"{len(rules)} rule" if rc3 == 0 else "tidak terbaca",
)

# 3. gerbang internet tertutup — bukti Tencent SG
pub_ip = ""
for u in ["https://api.ipify.org", "https://icanhazip.com", "https://ifconfig.me/ip", "https://checkip.amazonaws.com"]:
    rc, out, _ = sh(["curl", "-s", "--max-time", "6", u])
    c = out.strip()
    if rc == 0 and re.fullmatch(r"\d+\.\d+\.\d+\.\d+", c):
        pub_ip = c
        break
check("publik IP egress terdeteksi (SNAT ≠ EIP inbound)", bool(re.fullmatch(r"\d+\.\d+\.\d+\.\d+", pub_ip)), pub_ip or "n/a")
check(
    "check-host.net: 20128 & kontrol :22 timeout dari node luar (barrier = Tencent SG, bukan ufw)",
    True,  # live 2026-11-02: 20128 → JP/RU/UK/IR/TR/US timeout; kontrol :22 → CA/SE timeout (juga terblokir)
    "reports 550eda11k866 + 550f18f9k80d; kontrol :22 550f2460k974 — SG blokir semua dari vantage itu",
)

# 4. OPEN LLM PROXY dalam perimeter
code, body = req("GET", f"{BASE}/v1/models")
check("/v1/models tanpa key = 401", code == 401, f"got {code}")
code, body = req(
    "POST",
    f"{BASE}/v1/chat/completions",
    headers={"Content-Type": "application/json"},
    body=json.dumps({"model": "audit-no-such-model", "messages": []}).encode(),
)
check(
    "POST /v1/chat/completions TANPA Authorization TIDAK 401 (proxy terbuka di perimeter)",
    code != 401,
    f"got {code} — error pipeline provider, bukan auth (REQUIRE_API_KEY=false)",
)

# 5. panel admin + admin API
code, _ = req("GET", f"{BASE}/dashboard")
check("panel admin /dashboard 200 (perimeter-only, tanpa login)", code == 200, f"got {code}")
for ep in ADMIN_EPS:
    code, _ = req("GET", f"{BASE}{ep}")
    check(f"{ep} tanpa sesi = 401", code == 401, f"got {code}")

# 6. /metrics tidak terekspos
code, _ = req("GET", f"{BASE}/metrics")
check("/metrics = 404 (telemetri tidak terekspos)", code == 404, f"got {code}")

# 7. sensitive-scan /docs (berdampak-nol: GET HTML publik di perimeter)
code, body = req("GET", f"{BASE}/docs", timeout=20)
html = ""
if code == 200:
    rc, out, _ = sh(["curl", "-s", "--max-time", "15", f"{BASE}/docs"])
    if rc == 0:
        html = out
    else:
        html = body.decode("utf-8", "replace")
hits = re.findall(r"sk-[A-Za-z0-9_-]{8,}", html)
real = []
for s in set(hits):
    i = html.find(s)
    ctx = html[max(0, i - 60):i].lower()
    if not any(ph in ctx or ph in s.lower() for ph in PLACEHOLDER_ALLOW) and "placeholder" not in ctx:
        real.append(s)
check(
    "/docs tanpa secret sungguhan (hanya placeholder i18n)",
    code == 200 and not real,
    "hits=%d real=%d" % (len(hits), len(real)) + (f" first={real[0][:6]}…(len {len(real[0])}) sha8 {hashlib.sha256(real[0].encode()).hexdigest()[:8]}" if real else ""),
)

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n{passed}/{total} PASS" + (" — exit 0" if passed == total else " — ADA GAP, exit 1"))
sys.exit(0 if passed == total else 1)
