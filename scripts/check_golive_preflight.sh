#!/usr/bin/env bash
# check_golive_preflight.sh — preflight NON-DESTRUKTIF migrasi gateway :8787 systemd -> Docker
# (siklus 292). TIDAK menyentuh produksi: hanya verifikasi prasyarat cutover.
#
#   scripts/check_golive_preflight.sh          # semua cek preflight
#   exit code = jumlah FAIL (0 = siap APPLY, tetap butuh persetujuan user +
#               WFS_PHASE3_CUTOVER_REHEARSED=YES + rehearsal smoke Phase 3 baru)
#
# Konteks: APPLY di go_live_gateway_docker.sh terkunci ganda (siklus 156).
# smoke_go_live.sh fixture lama memuat 2 cek yang TIDAK kompatibel topologi
# Phase 3 hardened (no docker.sock di gateway): cek 5 (sandboxes via
# docker.sock) dan cek 7 (sandbox exec via gateway). Skrip ini memisahkan
# preflight agar APPLY berikutnya punya dasar terukur sebelum rehearsal baru.
set -u
BASE="${BASE:-http://127.0.0.1:8787}"
PROXY="${PROXY:-http://127.0.0.1:9503}"
REPO="${REPO:-/home/agentuser/ai-office-main}"
COMPOSE="$REPO/deploy/docker/compose.go-live.yaml"
fails=0
ok()  { echo "PASS $1"; }
bad() { echo "FAIL $1: $2"; fails=$((fails+1)); }

# 1) systemd wfs-office aktif (prasyarat APPLY)
if systemctl is-active --quiet wfs-office; then ok "systemd wfs-office active"; else bad "systemd wfs-office" "tidak aktif"; fi

# 2) gateway sehat + agents kontrak
h=$(curl -s -m 5 "$BASE/api/health" 2>/dev/null)
echo "$h" | grep -q '"ok": *true' && ok "gateway /api/health" || bad "gateway /api/health" "$h"
s=$(curl -s -m 5 "$BASE/api/status" 2>/dev/null)
echo "$s" | grep -q '"agents": *15' && ok "agents=15 (kontrak wire)" || bad "agents kontrak" "$s"

# 3) proxy :9503 → gateway
p=$(curl -s -m 5 "$PROXY/wfs-api/health" 2>/dev/null)
echo "$p" | grep -q '"ok": *true' && ok "proxy :9503 /wfs-api/health" || bad "proxy :9503" "$p"

# 4) manifest compose valid
if docker compose -f "$COMPOSE" config -q 2>/dev/null; then ok "compose.go-live.yaml valid"; else bad "compose config" "$COMPOSE"; fi

# 5) image cutover tersedia (hasil build pra-APPLY)
if docker image inspect wfs-office-gw:go-live >/dev/null 2>&1; then
  ok "image wfs-office-gw:go-live ada"
else
  bad "image wfs-office-gw:go-live" "belum dibangun — docker build -f deploy/docker/Dockerfile.wfs-office-gw"
fi

# 6) gate APPLY: variabel rehearsal Phase 3 (harus BELUM diset pada preflight)
if [ "${WFS_PHASE3_CUTOVER_REHEARSED:-}" = "YES" ]; then
  bad "gate APPLY" "WFS_PHASE3_CUTOVER_REHEARSED=YES terlihat di shell ini — jangan eksport di luar sesi APPLY"
else
  ok "gate APPLY terkunci (rehearsal Phase 3 belum diset)"
fi

# 7) smoke legacy: tandai 2 cek yang butuh pengganti Phase 3 (dokumentasi status)
echo "NOTE smoke legacy: cek 5 (docker.sock) & 7 (exec) tak kompatibel Phase 3 — perlu smoke baru sebelum APPLY"

echo "----"
echo "PREFLIGHT fails=$fails base=$BASE"
exit $fails
