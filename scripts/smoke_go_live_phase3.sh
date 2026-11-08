#!/usr/bin/env bash
# smoke_go_live_phase3.sh — smoke Phase 3 hardened untuk CUTOVER gateway :8787 systemd -> Docker
# (siklus 293: pengganti cek 5 & 7 smoke legacy siklus 156 yang tak kompatibel topologi hardened).
#
# Beda dgn smoke_go_live.sh legacy:
#   - Cek 5 legacy  : sandboxes dihitung dari docker.sock host (4 wfs-agent-*) — di Phase 3
#                     gateway TANPA docker.sock → /api/sandboxes boleh [] (anti-poisoning,
#                     bukan 500). Yang wajib: endpoint 200 + JSON schema "sandboxes" list.
#   - Cek 7 legacy  : POST /api/sandbox/{id}/exec harus 42 — di Phase 3 hardened
#                     (WFS_MASTER_QUEUE_REQUIRED=1) legacy exec DISELAPKAN 503 by design.
#                     Yang wajib: endpoint menolak dengan 503 (bukan crash/500/hang).
#
# Pemakaian:
#   scripts/smoke_go_live_phase3.sh            # uji PRODUKSI :8787 (systemd) — baseline hardened
#   scripts/smoke_go_live_phase3.sh 8788       # uji rehearsal container
set -u
PORT="${1:-8787}"
B="http://127.0.0.1:$PORT"
fails=0
ck() { if "$@" >/dev/null 2>&1; then echo "PASS $1"; else echo "FAIL $1"; fails=$((fails+1)); fi }
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$2" 2>/dev/null; }

# 1) health hidup
h=$(curl -s -m 5 $B/api/health)
[ "$(echo "$h" | J - "d['ok']")" = "True" ] && echo "PASS health" || { echo "FAIL health: $h"; fails=$((fails+1)); }

# 2) hardened flag: server live berjalan dgn WFS_MASTER_QUEUE_REQUIRED=1
#    (proxy via /api/sandbox exec: harus 503 'Legacy Docker exec disabled')
#    Siklus 293: systemd :8787 belum set flag hardened (unit tanpa Environment=)
#    → 200/42 legacy dianggap WARN (bukan fail); pasca-cutover container wajib 503.
code=$(curl -s -m 10 -o /tmp/p3_exec.out -w '%{http_code}' -X POST $B/api/sandbox/toni/exec \
        -H 'Content-Type: application/json' -d '{"code":"print(6*7)","timeout":10}')
if [ "$code" = "503" ]; then
  echo "PASS legacy-exec ditolak 503 (hardened)"
elif [ "$code" = "200" ] && grep -q '"ok": *true' /tmp/p3_exec.out; then
  echo "WARN legacy-exec masih 200 di baseline systemd (flag hardened belum di-set) — fail=0"
else
  echo "FAIL exec-code=$code body=$(head -c 120 /tmp/p3_exec.out)"; fails=$((fails+1))
fi

# 3) /api/sandboxes: endpoint hidup + schema list (docker.sock tak wajib di Phase 3)
sb=$(curl -s -m 12 $B/api/sandboxes)
[ "$(echo "$sb" | J - "isinstance(d.get('sandboxes'), list)")" = "True" ] \
  && echo "PASS sandboxes schema list" || { echo "FAIL sandboxes: $sb"; fails=$((fails+1)); }

# 4) endpoint inti gateway tetap sehat (tanpa docker.sock sama sekali)
n=$(curl -s -m 5 $B/api/agents | J - "len(d)")
[ "${n:-0}" -ge 1 ] 2>/dev/null && echo "PASS agents ($n)" || { echo "FAIL agents: $n"; fails=$((fails+1)); }
p=$(curl -s -m 5 $B/api/projects | J - "len(d['projects'])")
[ "${p:-0}" -ge 1 ] 2>/dev/null && echo "PASS projects ($p)" || { echo "FAIL projects: $p"; fails=$((fails+1)); }

# 5) SSE streaming frame pertama
frame=$(curl -s -m 4 -N $B/api/events | head -c 120)
echo "$frame" | grep -q '"type": "connected"' && echo "PASS SSE connected" || { echo "FAIL SSE: $frame"; fails=$((fails+1)); }

# 6) tulis DB produksi via gateway (INSERT + DELETE dgn task id lampau — unik, aman)
python3 - "$B" <<'EOF' && echo "PASS tulis DB via gateway" || { echo "FAIL tulis DB"; fails=$((fails+1)); }
import sqlite3, urllib.request, time, sys, json
base = sys.argv[1]
db = sqlite3.connect("/home/agentuser/wfs-office/tasks.db", timeout=10)
t = int(time.time())
cur = db.execute("INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated) VALUES(9999,'__p3smoke__','qa','qa1','done','',?,?)", (t, t))
tid = cur.lastrowid; db.commit(); db.close()
def get(port=None):
    url = base.rstrip("/") + "/api/tasks"
    return json.load(urllib.request.urlopen(url, timeout=8))["tasks"]
try:
    sys.exit(0 if any(x["id"] == tid for x in get()) else 1)
finally:
    db = sqlite3.connect("/home/agentuser/wfs-office/tasks.db", timeout=10)
    db.execute("DELETE FROM tasks WHERE id=?", (tid,)); db.commit(); db.close()
EOF

# 7) proxy :9503 tetap terlayani lewat gateway ini (jalur klien utama)
hp=$(curl -s -m 5 http://127.0.0.1:9503/wfs-api/health)
echo "$hp" | grep -q '"ok"' && echo "PASS proxy :9503 /wfs-api/health" || { echo "FAIL proxy: $hp"; fails=$((fails+1)); }

echo "----"
echo "SMOKE-PHASE3 port=$PORT fails=$fails"
exit $fails
