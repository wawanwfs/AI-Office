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

wait_http() {
  # Poll HTTP langsung (uvicorn siap ~1-2 dtk) — bukan menunggu docker health
  # (interval 15s + start_period 10s = flip healthy 15-30 dtk, terlalu lama utk downtime).
  local i
  for i in $(seq 1 12); do
    curl -fsS --max-time 2 "$BASE/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  log "gateway tidak merespons dalam 12 dtk pasca-up:"; docker logs --tail 20 wfs-office-gateway || true
  return 1
}

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
  log "== smoke 10 cek (fixture go-live siklus 156) =="
  if ! bash "$REPO/scripts/smoke_go_live.sh" "$BASE" >/tmp/go-live-smoke.log 2>&1; then
    log "SMOKE GAGAL (log: /tmp/go-live-smoke.log)"; tail -n 5 /tmp/go-live-smoke.log
    return 1
  fi
  log "SMOKE PASS 10/10 (log: /tmp/go-live-smoke.log)"
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
check "pre: agents=15" "$BASE/api/status" '"agents":15' || die "agents != 15 sebelum APPLY"
save_state

# ---------- Fase 1: build image (produksi systemd tak tersentuh) ----------
log "-- Fase 1: build image wfs-office-gw:go-live (produksi systemd masih pegang :8787) --"
docker compose -f "$COMPOSE_FILE" build >>/tmp/go-live.log 2>&1 \
  || { log "docker compose build gagal"; tail -n 15 /tmp/go-live.log; auto_rollback; exit 1; }
log "image siap (config non-root 1002:1003+g125 pra-validasi siklus 156: uji temp :8789 health/exec/SSE OK)"

# ---------- Fase 2: cutover (downtime ~2-4 dtk) ----------
log "-- Fase 2: cutover — stop systemd, up container (bind :8787 bebas) --"
sudo systemctl stop wfs-office || { log "systemctl stop wfs-office gagal"; auto_rollback; exit 1; }
docker compose -f "$COMPOSE_FILE" up -d >>/tmp/go-live.log 2>&1 \
  || { log "docker compose up gagal"; tail -n 15 /tmp/go-live.log; auto_rollback; exit 1; }
wait_http || { auto_rollback; exit 1; }
check "pasca-cutover: :8787 /api/health" "$BASE/api/health" "ok" || { auto_rollback; exit 1; }
check "pasca-cutover: :9503 /wfs-api/health" "$PROXY/wfs-api/health" "ok" || { auto_rollback; exit 1; }

# ---------- Fase 3: verifikasi penuh (fixture go-live siklus 156) ----------
smoke_10 || { auto_rollback; exit 1; }

# ---------- Fase 4: selesai ----------
log "== MIGRASI SELESAI: :8787 kini container Docker (restart unless-stopped) =="
log "Pindah kembali kapan pun: $SELF ROLLBACK"
log "Catatan: unit systemd wfs-office tidak diubah/disabled (inactive; start manual aman)"
save_state
exit 0
