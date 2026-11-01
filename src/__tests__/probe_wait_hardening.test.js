import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 200: hardening kelas WAIT_ID + EXCEPTIONDETAILS di 13 probe CDP
// tersisa (office_phase sudah di-fix 199; kelas cacat sama yang ditemukan
// di sana dilacak lintas seluruh direktori scripts/):
//
//  b1 — wait_id(tries×timeout=20) TANPA deadline total: office_phase 200×20 s
//       = 66 menit worst case; scene_hooks bahkan 600×20 s = 3.3 JAM (reply
//       hilang tapi socket hidup → cron/probe menggantung, bukan FAIL jujur).
//       Fix kelas: deadline TOTAL 60 dtk — `msgq.get(timeout=min(20, remaining))`,
//       remaining <= 0 → return None (tercatat jujur).
//  b2 — ev() menelan exceptionDetails senyap → FAIL tanpa diagnosis (pola b2
//       199). Fix kelas: surface res["_exc"] (300 char); scene_hooks punya
//       kontrak return-value berbeda → print diagnosis ke stderr, kontrak utuh.
//
// Kriteria inti tiap probe TIDAK berubah (hanya mekanisme tunggu/diagnosis).
//
// Sumber kebenaran = teks skrip (unit Python butuh Xvfb :99 + chrome — di
// luar vitest; pola agent_phase_hardening 199).

const here = fileURLToPath(new URL('.', import.meta.url))
const dir = resolve(here, '../../scripts')

const PLAIN = ['e2e_floor_occupancy', 'e2e_goal_floor_live', 'e2e_inspector_floor',
  'e2e_inspector_status', 'e2e_select_floor_live', 'e2e_team_presence',
  'e2e_ticker_presence', 'e2e_camera_floor_live', 'e2e_dashboard_presence']
const AWAIT = ['e2e_dashboard_stats_grid', 'e2e_events_stream', 'e2e_sh_console_overview']
const SCENE_HOOKS = 'e2e_scene_hooks'
const NEW_199 = 'e2e_office_phase'
const ALL14 = [...PLAIN, ...AWAIT, SCENE_HOOKS, NEW_199]

const src = Object.fromEntries(ALL14.map((n) => [n, readFileSync(resolve(dir, `${n}.py`), 'utf-8')]))

describe('siklus 200 — wait_id deadline TOTAL di 14 probe CDP (kelas b1 199)', () => {
  it('semua 14 wait_id membawa deadline = time.time() + 60 + min(20, remaining)', () => {
    for (const n of ALL14) {
      const w = src[n]
      expect(w, n).toContain('deadline = time.time() + 60')
      expect(w, n).toContain('msgq.get(timeout=min(20, remaining))')
      expect(w, n).toContain('if remaining <= 0:')
    }
  })

  it('tidak ada lagi msgq.get(timeout=20) tanpa deadline total di seluruh 14 probe', () => {
    for (const n of ALL14) {
      expect(src[n], n).not.toContain('msgq.get(timeout=20)')
    }
  })

  it('alasan terdokumentasi di sumber (bukan magic number) + tries asli dipertahankan', () => {
    for (const n of ALL14) {
      if (n === NEW_199) continue // 199 pakai rumusan sendiri
      expect(src[n], n).toContain('siklus 200')
    }
    expect(src[SCENE_HOOKS]).toContain('tries=600') // worst case lama 3.3 jam
    expect(src[SCENE_HOOKS]).toContain('tries×timeout=20 dtk = worst case 200 MENIT')
  })
})

describe('siklus 200 — exceptionDetails tidak ditelan senyap (kelas b2 199)', () => {
  it('13 probe bawa res["_exc"]; scene_hooks print diagnosis ke stderr (kontrak return utuh)', () => {
    for (const n of ALL14) {
      if (n === SCENE_HOOKS) {
        expect(src[n], n).toContain('E2E_SCENE_HOOKS _exc:')
        expect(src[n], n).toContain('file=sys.stderr')
        // kontrak return value TIDAK berubah
        expect(src[n], n).toContain('return (res.get("result") or {}).get("value")')
      } else {
        expect(src[n], n).toContain('res["_exc"]')
        expect(src[n], n).toContain('exceptionDetails')
      }
    }
  })
})

describe('siklus 200 — kriteria inti probe TIDAK berubah (spot-check per kelompok)', () => {
  it('team_presence: dock panel + transisi kehadiran pod', () => {
    expect(src['e2e_team_presence']).toContain("==='Statistik tim'")
    expect(src['e2e_team_presence']).toContain('Kehadiran live')
  })

  it('stats_grid + sh_console_overview + events_stream (awaitPromise): kartu stats & stream', () => {
    expect(src['e2e_dashboard_stats_grid']).toContain('awaitPromise=True')
    expect(src['e2e_dashboard_stats_grid']).toContain('truth')
    expect(src['e2e_sh_console_overview']).toContain('awaitPromise=True')
    expect(src['e2e_events_stream']).toContain('awaitPromise=True')
  })

  it('scene_hooks: destroy → recreate + zona=5 + sisa hook', () => {
    expect(src[SCENE_HOOKS]).toContain('destroyed')
    expect(src[SCENE_HOOKS]).toContain('__sceneModuleUrl')
    expect(src[SCENE_HOOKS]).toContain('HOOKS_LEFT')
  })

  it('goal_floor_live + floor_occupancy + inspector (plain): gate lantai & kafe', () => {
    expect(src['e2e_goal_floor_live']).toContain('__agentData')
    expect(src['e2e_floor_occupancy']).toContain('__setTime(720)')
    expect(src['e2e_floor_occupancy']).toContain('__agentData')
    expect(src['e2e_inspector_status']).toContain('__agentData')
  })

  it('office_phase 199 tak ter-regresi: chip fase + __setTime(720) + deadline 60', () => {
    expect(src[NEW_199]).toContain('.hud .phase-chip')
    expect(src[NEW_199]).toContain('__setTime(720)')
    expect(src[NEW_199]).toContain('deadline = time.time() + 60')
    expect(src[NEW_199]).toContain('Istirahat makan siang')
  })
})
