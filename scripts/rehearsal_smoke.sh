#!/usr/bin/env bash
# Smoke test rehearsal gateway :8788 (container) — produksi :8787 hanya dibaca untuk paritas.
# Pakai: scripts/rehearsal_smoke.sh   (exit 0 = semua PASS)
set -u
RH=http://127.0.0.1:8788
PR=http://127.0.0.1:8787
fails=0
ck() { # ck <nama> <expr(0=ok)>
  if "$@" >/dev/null 2>&1; then echo "PASS $1"; else echo "FAIL $1"; fails=$((fails+1)); fi
}
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$2" 2>/dev/null; }

# 1) health + default AI (HOME mount .hermes/.env)
h=$(curl -s -m 5 $RH/api/health)
[ "$(echo "$h" | J - "d['ok']")" = "True" ] && echo "PASS health" || { echo "FAIL health"; fails=$((fails+1)); }
[ "$(echo "$h" | J - "d['default_model']")" = "auto" ] && echo "PASS default-ai(auto) — .env terbaca" || { echo "FAIL default-ai"; fails=$((fails+1)); }

# 2) paritas status & agents (container vs produksi)
srh=$(curl -s -m 5 $RH/api/status); spr=$(curl -s -m 5 $PR/api/status)
[ "$(echo "$srh" | J - "d['agents']")" = "$(echo "$spr" | J - "d['agents']")" ] && echo "PASS status.agents paritas ($(echo "$srh" | J - "d['agents']"))" || { echo "FAIL status.agents"; fails=$((fails+1)); }
arh=$(curl -s -m 5 $RH/api/agents | J - "len(d)"); apr=$(curl -s -m 5 $PR/api/agents | J - "len(d)")
[ "$arh" = "$apr" ] && echo "PASS agents list paritas ($arh agen)" || { echo "FAIL agents list ($arh vs $apr)"; fails=$((fails+1)); }

# 3) data (DB salinan): projects & orders identik dgn produksi
[ "$(curl -s -m 5 $RH/api/projects | J - "len(d['projects'])")" = "$(curl -s -m 5 $PR/api/projects | J - "len(d['projects'])")" ] \
  && echo "PASS projects paritas" || { echo "FAIL projects"; fails=$((fails+1)); }
[ "$(curl -s -m 5 $RH/api/orders/ | J - "len(d['orders'])")" = "$(curl -s -m 5 $PR/api/orders/ | J - "len(d['orders'])")" ] \
  && echo "PASS orders paritas" || { echo "FAIL orders"; fails=$((fails+1)); }

# 4) SSE connected frame < 4 dtk (streaming hidup di container)
frame=$(curl -s -m 4 -N $RH/api/events | head -c 120)
echo "$frame" | grep -q '"type": "connected"' && echo "PASS SSE connected" || { echo "FAIL SSE: $frame"; fails=$((fails+1)); }

# 5) sandboxes via docker socket host
sb=$(curl -s -m 10 $RH/api/sandboxes)
[ "$(echo "$sb" | J - "sum(1 for b in d['sandboxes'] if b.startswith('wfs-agent-'))")" = "4" ] \
  && echo "PASS sandboxes (4 wfs-agent via docker.sock)" || { echo "FAIL sandboxes: $sb"; fails=$((fails+1)); }

# 6) isolasi DB: INSERT di rehearsal TIDAK terlihat di produksi (lalu dibersihkan)
python3 - <<'EOF' && echo "PASS isolasi DB (rehearsal copy, bukan produksi)" || { echo "FAIL isolasi DB"; fails=$((fails+1)); }
import sqlite3, json, urllib.request, time, sys
db = sqlite3.connect("/home/agentuser/wfs-office/rehearsal-data/tasks.db")
t = int(time.time())
cur = db.execute("INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated) VALUES(9999,'__rehearsal155__','qa','qa1','pending','',?,?)", (t, t))
tid = cur.lastrowid; db.commit()
def titles(port):
    return json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/tasks", timeout=5))["tasks"]
try:
    rh = any(x["id"] == tid for x in titles(8788))
    pr = any(x["id"] == tid for x in titles(8787))
    sys.exit(0 if (rh and not pr) else 1)
finally:
    db.execute("DELETE FROM tasks WHERE id=?", (tid,)); db.commit(); db.close()
EOF

# 7) docker exec via gateway container (print saja — engine DIJEDA, tanpa efek)
ex=$(curl -s -m 30 -X POST $RH/api/sandbox/toni/exec -H 'Content-Type: application/json' -d '{"code":"print(6*7)","timeout":20}')
echo "$ex" | grep -q '"ok": *true' && echo "PASS sandbox exec via container gateway (42)" || { echo "FAIL exec: $ex"; fails=$((fails+1)); }

echo "----"; echo "SMOKE fails=$fails"
exit $fails
