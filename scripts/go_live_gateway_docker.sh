#!/usr/bin/env bash
# go_live_gateway_docker.sh — migrasi satu-perintah gateway :8787 systemd -> Docker
#   (rehearsal siklus 155 LULUS penuh; siklus 156 = runbook + switcher terkunci ganda)
#
# PENGGUNAAN (APPLY wajib persetujuan eksplisit user — menyentuh systemd produksi):
#   scripts/go_live_gateway_docker.sh APPLY      # migrasi + verifikasi + auto-rollback bila gagal
#   scripts/go_live_gateway_docker.sh ROLLBACK   # kembali ke systemd kapan pun
#
# Topologi (terverifikasi siklus 156):
#   - Klien :8787 = 100% loopback: proxy :9503 (GATEWAY + SSE passthrough), project_api
#     (WFS-Project http + URL waktu-nyata), salinan repo lama. TIDAK ADA akses eksternal
#     (ss: LISTEN 0.0.0.0:8787 hanya systemd; cron hanya backup_db 03:30; agents exec
#     docker CLI via docker.sock — bukan HTTP).
#   - Proxy :9503 hardcode 127.0.0.1:8787 => container HARUS memegang 0.0.0.0:8787 di
#     netns host => network_mode: host + WFS_PORT=8787, tanpa perubahan proxy/agent/cron.
#   - Rollback systemd aman kapan pun: bind host kembali bebas setelah container stop;
#     unit tidak diubah/disabled (hanya stop/start).
#   - DB journal=delete + sqlite timeout default 5s (tasks.py) => downtime 3-4 dtk aman
#     untuk 5 klien (retry, poll 4-10 dtk, humans-in-loop, next-day cron 03:30).
#
# Garansi:
#   - APPLY gagal di fase mana pun => auto-ROLLBACK terukur => kondisi awal (systemd).
#   - Verifikasi pasca-migrasi = fixture rehearsal (rehearsal_smoke.sh 10/10), bukan harapan.
set -u
set -o pipefail

REPO="${REPO:-/home/agentuser/ai-office-main}"
COMPOSE_FILE="$REPO/deploy/docker/compose.go-live.yaml"
SMOKE="$REPO/scripts/rehearsal_smoke.sh"
BASE="http://127.0.0.1:8787"
PROXY="http://127.0.0.1:9503"
STATE_F=/tmp/go-live-state
SELF="$(readlink -f "$0")"

TS() { date '+%F %T'; }
log() { echo "[$(TS)] $*"; }
die() { log "FATAL: $*"; exit 1; }

check() {
  # check <nama> <url> [pola-yang-harus-ada]
  local name="$1" url="$2" want="${3:-}" out rc=0
  out="$(curl -fsS --max-time 10 "$url")" || rc=$?
  if [ "$rc" -ne 0 ]; then log "FAIL $name (curl rc=$rc)"; return 1; fi
  if [ -n "$want" ] && ! printf '%s' "$out" | grep -q "$want"; then
    log "FAIL $name: pola '$want' tak ditemukan"; return 1
  fi
  log "OK   $name"
  return 0
}

docker_status() { docker inspect -f '{{.State.Status}}' wfs-office-gateway 2>/dev/null || echo absent; }
docker_healthy() { [ "$(docker inspect -f '{{.State.Health.Status}}' wfs-office-gateway 2>/dev/null)" = "healthy" ]; }

save_state() {
  {
    echo "systemd_active=$(systemctl is-active wfs-office)"
    echo "container=$(docker_status)"
    echo "ts=$(date +%s)"
  } > "$STATE_F"
}

auto_rollback() {
  log "== AUTO-ROLLBACK (APPLY gagal; produksi kembali ke systemd) =="
  docker rm -f wfs-office-gateway >/dev/null 2>&1 || true
  sudo systemctl start wfs-office || die "systemctl start wfs-office gagal saat rollback (WAJIB ditangani manual: journalctl -u wfs-office)"
  sleep 2
  check "rollback: :8787 /api/health" "$BASE/api/health" "ok" || die "gateway systemd tak sehat pasca-rollback"
  check "rollback: :9503 /wfs-api/health" "$PROXY/wfs-api/health" "ok" || true
  save_state
  log "ROLLBACK SELESAI — kondisi = sebelum APPLY. Log lengkap: /tmp/go-live.log"
}

smoke_10() {
  log "== smoke 10 cek (fixture rehearsal siklus 155) =="
  if ! sudo -n bash "$SMOKE" --base "$BASE" >/tmp/go-live-smoke.log 2>&1; then
    log "SMOKE GAGAL (log: /tmp/go-live-smoke.log)"; tail -n 5 /tmp/go-live-smoke.log
    return 1
  fi
  log "SMOKE PASS 10/10 (log: /tmp/go-live-smoke.log)"
}

wait_healthy() {
  local i
  for i in $(seq 1 30); do
    docker_healthy && return 0
    if [ "$(docker_status)" = "exited" ]; then
      log "container exited dini:"; docker logs --tail 20 wfs-office-gateway || true
      return 1
    fi
    sleep 3
  done
  log "container tidak healthy dalam 90 dtk"; docker logs --tail 20 wfs-office-gateway || true
  return 1
}

case "${1:-}" in
  ROLLBACK)
    log "== ROLLBACK manual: systemd wfs-office kembali pegang :8787 =="
    docker rm -f wfs-office-gateway >/dev/null 2>&1 || true
    sudo systemctl start wfs-office || die "systemctl start wfs-office gagal (journalctl -u wfs-office)"
    sleep 2
    check ":8787 /api/health" "$BASE/api/health" "ok" || die "gateway systemd tak sehat"
    check ":9503 /wfs-api/health" "$PROXY/wfs-api/health" "ok" || true
    save_state
    log "ROLLBACK SELESAI — produksi kembali systemd."
    exit 0
    ;;
  APPLY)
    ;;
  *)
    die "pakai: $0 APPLY | ROLLBACK"
    ;;
esac

log "== MIGRASI :8787 systemd -> Docker (runbook siklus 156) =="

# ---------- Fase 0: preflight (tidak menyentuh produksi) ----------
log "-- Fase 0: preflight --"
docker compose -f "$COMPOSE_FILE" config >/dev/null 2>&1 || die "compose.go-live.yaml tidak valid: $COMPOSE_FILE"
systemctl is-active --quiet wfs-office || die "unit wfs-office tidak aktif (harus aktif sebelum APPLY)"
check "pre: :8787 /api/health" "$BASE/api/health" "ok" || die ":8787 tidak merespons sebelum APPLY"
check "pre: :9503 /wfs-api/health" "$PROXY/wfs-api/health" "ok" || true
check "pre: agents=15" "$BASE/api/status" '"agents_count":15' || die "agents_count != 15 sebelum APPLY"
save_state

# ---------- Fase 1: build & jalankan container (produksi systemd MASIH jalan) ----------
log "-- Fase 1: build & up wfs-office-gateway (produksi systemd masih pegang :8787) --"
docker compose -f "$COMPOSE_FILE" up -d --build >>/tmp/go-live.log 2>&1 \
  || { log "docker compose up --build gagal"; tail -n 15 /tmp/go-live.log; auto_rollback; exit 1; }
wait_healthy || { auto_rollback; exit 1; }
log "container healthy (image wfs-office-gw:go-live siap; cutover berikutnya ~3-4 dtk)"

# ---------- Fase 2: cutover (3 langkah atomik) ----------
log "-- Fase 2: cutover — stop systemd, start ulang container (bind :8787) --"
sudo systemctl stop wfs-office || { log "systemctl stop wfs-office gagal"; auto_rollback; exit 1; }
docker restart wfs-office-gateway >/dev/null || { log "restart container gagal"; auto_rollback; exit 1; }
for i in 1 2 3 4 5 6; do
  curl -fsS --max-time 2 "$BASE/api/health" >/dev/null 2>&1 && break
  sleep 1
done
check "pasca-cutover: :8787 /api/health" "$BASE/api/health" "ok" || { auto_rollback; exit 1; }
check "pasca-cutover: :9503 /wfs-api/health" "$PROXY/wfs-api/health" "ok" || { auto_rollback; exit 1; }

# ---------- Fase 3: verifikasi penuh (fixture rehearsal) ----------
smoke_10 || { auto_rollback; exit 1; }
check "post: agents=15" "$BASE/api/status" '"agents_count":15' || { auto_rollback; exit 1; }

# ---------- Fase 4: selesai ----------
log "== MIGRASI SELESAI: :8787 kini container Docker (restart unless-stopped) =="
log "Pindah kembali kapan pun: $SELF ROLLBACK"
log "Catatan: unit systemd wfs-office tidak diubah/disabled (inactive; start manual aman)"
save_state
exit 0
