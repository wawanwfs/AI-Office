#!/usr/bin/env bash
# smoke_go_live.sh — verifikasi gateway pasca-migrasi (siklus 156).
#   Pakai: scripts/smoke_go_live.sh http://127.0.0.1:8787
#   Exit code = jumlah FAIL (0 = semua PASS).
#
# Beda dgn rehearsal_smoke.sh (155): rehearsal membandingkan container-copy :8788
# vs produksi :8787. Di sini BASE ADALAH produksi (container memegang :8787),
# jadi: cek absolut (bukan paritas dua port) + UJI TULIS DB produksi yang aman
# (INSERT task via sqlite -> muncul di API -> DELETE; pola seed terbukti siklus
# 154; task engine DIJEDA sehingga tak ada konsumsi otomatis).
set -u
BASE="${1:-}"
[ -n "$BASE" ] || { echo "pakai: $0 <base-url>"; exit 99; }
DB=/home/agentuser/wfs-office/tasks.db
fails=0
ck() { if "$@" >/dev/null 2>&1; then echo "PASS $1"; else echo "FAIL $1"; fails=$((fails+1)); fi; }
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1" 2>/dev/null; }

# 1) health + default AI (.env terbaca via HOME=/hermes-home)
h=$(curl -s -m 5 "$BASE/api/health")
[ "$(echo "$h" | J "d['ok']")" = "True" ] && echo "PASS health" || { echo "FAIL health: $h"; fails=$((fails+1)); }
[ "$(echo "$h" | J "d['default_model']")" = "auto" ] && echo "PASS default-ai(auto) — .env terbaca" || { echo "FAIL default-ai"; fails=$((fails+1)); }

# 2) status & agents (absolut: AGENTS_META 15 + cfg kustom)
s=$(curl -s -m 5 "$BASE/api/status")
[ "$(echo "$s" | J "d['agents']")" = "15" ] && echo "PASS agents=15" || { echo "FAIL agents: $s"; fails=$((fails+1)); }
na=$(curl -s -m 5 "$BASE/api/agents" | J "len(d)")
[ "$na" = "15" ] && echo "PASS agents list (15)" || { echo "FAIL agents list: $na"; fails=$((fails+1)); }

# 3) data produksi terbaca dari DB bind
np=$(curl -s -m 5 "$BASE/api/projects" | J "len(d['projects'])")
[ -n "$np" ] && [ "$np" != "None" ] && echo "PASS projects terbaca ($np)" || { echo "FAIL projects"; fails=$((fails+1)); }
no=$(curl -s -m 5 "$BASE/api/orders/" | J "len(d['orders'])")
[ -n "$no" ] && [ "$no" != "None" ] && echo "PASS orders terbaca ($no)" || { echo "FAIL orders"; fails=$((fails+1)); }

# 4) SSE connected frame < 4 dtk (streaming hidup)
frame=$(curl -s -m 4 -N "$BASE/api/events" | head -c 120)
echo "$frame" | grep -q '"type": "connected"' && echo "PASS SSE connected" || { echo "FAIL SSE: $frame"; fails=$((fails+1)); }

# 5) sandboxes via docker.sock host (4 container wfs-agent)
sb=$(curl -s -m 10 "$BASE/api/sandboxes")
[ "$(echo "$sb" | J "sum(1 for b in d['sandboxes'] if b.startswith('wfs-agent-'))")" = "4" ] \
  && echo "PASS sandboxes (4 wfs-agent via docker.sock)" || { echo "FAIL sandboxes: $sb"; fails=$((fails+1)); }

# 6) UJI TULIS DB produksi yang aman: INSERT via sqlite -> terlihat via API -> DELETE
python3 - "$BASE" <<'EOF' && echo "PASS tulis DB produksi (INSERT->API->DELETE)" || { echo "FAIL tulis DB"; fails=$((fails+1)); }
import sqlite3, json, urllib.request, time, sys
base = sys.argv[1]
db = sqlite3.connect("/home/agentuser/wfs-office/tasks.db", timeout=10)
t = int(time.time())
cur = db.execute("INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated) VALUES(9999,'__golive156__','qa','qa1','pending','',?,?)", (t, t))
tid = cur.lastrowid; db.commit()
try:
    tasks = json.load(urllib.request.urlopen(base + "/api/tasks", timeout=5))["tasks"]
    sys.exit(0 if any(x["id"] == tid for x in tasks) else 1)
finally:
    db.execute("DELETE FROM tasks WHERE id=?", (tid,)); db.commit(); db.close()
EOF

# 7) exec di container agent via gateway (print saja — engine DIJEDA)
ex=$(curl -s -m 30 -X POST "$BASE/api/sandbox/toni/exec" -H 'Content-Type: application/json' -d '{"code":"print(6*7)","timeout":20}')
echo "$ex" | grep -q '"ok": *true' && echo "PASS sandbox exec via gateway (42)" || { echo "FAIL exec: $ex"; fails=$((fails+1)); }

echo "----"; echo "SMOKE-GOLIVE fails=$fails base=$BASE"
exit $fails
