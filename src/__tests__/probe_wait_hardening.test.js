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
// Siklus 272: kontrak ground-truth eksak per-bidang UI (pelajaran 271
// diteruskan) — TRUTH_FETCH sh_console kini membaca d.total_logs (bidang yang
// dilukis kartu 'Log event'), bukan (d.recent_logs||[]).length yang hanya
// menghitung baris list (17 vs 8 di produksi → probe lama FAIL permanen).
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
  it('team_presence: dock panel + transisi chip kehadiran pod', () => {
    expect(src['e2e_team_presence']).toContain("==='Statistik tim'")
    expect(src['e2e_team_presence']).toContain("di pod")
    expect(src['e2e_team_presence']).toContain("'.team-presence'")
  })

  it('stats_grid + sh_console_overview + events_stream (awaitPromise): kartu stats & stream', () => {
    expect(src['e2e_dashboard_stats_grid']).toContain('awaitPromise=True')
    expect(src['e2e_dashboard_stats_grid']).toContain('truth')
    expect(src['e2e_sh_console_overview']).toContain('awaitPromise=True')
    expect(src['e2e_events_stream']).toContain('awaitPromise=True')
  })

  it('siklus 271 — stats_grid kontrak logrows = min(server.logs, slice UI 8), bukan len mentah', () => {
    // Celah laten 28 Okt: Dashboard merender .slice(0, 8) sementara server
    // LOG_LIMIT 15 → probe lama FAIL permanen begitu logs >= 8 (live 271:
    // lg 15 vs DOM 8). Kontrak probe kini ekspektasi min(len, 8).
    expect(src['e2e_dashboard_stats_grid']).toContain('lg:Math.min((d.logs||[]).length, 8)')
    expect(src['e2e_dashboard_stats_grid']).not.toContain('lg:(d.logs||[]).length}')
    // Kontrak sumber UI yang dihitung probe tetap tercatat di sumber probe
    expect(src['e2e_dashboard_stats_grid']).toContain('.slice(0, 8)')
  })

  it('siklus 272 — sh_console_overview kontrak lg = total_logs (kartu "Log event" UI), bukan recent_logs.length', () => {
    // Celah laten 29 Okt (siklus 153): kartu 'Log event' di ShConsole overview
    // merender ov.total_logs (17 di produksi) sedangkan TRUTH_FETCH lama
    // mengambil (d.recent_logs||[]).length (8) → probe lama FAIL deterministik
    // begitu total_logs > recent_logs.length (live 272: 17 vs 8).
    // Kontrak probe kini d.total_logs untuk kartu 'Log event' dan recent_len untuk baris log list.
    expect(src['e2e_sh_console_overview']).toContain('d.total_logs')
    expect(src['e2e_sh_console_overview']).not.toContain('lg:(d.recent_logs||[]).length}')
    expect(src['e2e_sh_console_overview']).toContain('recent_len')
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

  it('siklus 276 — floor_occupancy & inspector_floor: normalisasi jam sim PRA-baseline (akar FAIL-by-jam lunch 12:xx WIB)', () => {
    // timeOfDay awal = jam NYATA load (OfficeScene.js:1476). Load di window
    // lunch sim 12:00–13:00 → shiftStep langsung lunch_start → SEMUA agen
    // jalan ke kafe sebelum baseline → base L3:26 → syarat L3>=base+3
    // mustahil → FAIL deterministik sesuai jam eksekusi (terbukti live siklus
    // 276: 3× FAIL beruntun jam 12:1x–12:4x WIB setelah 274/275 hijau jam
    // pagi). Kontrak: setTime(480) SEBELUM baseline + tunggu lunch==0, dan
    // pola lama "setTime(480) + sleep(2) + baca baseline TANPA guard lunch"
    // DILARANG kembali.
    for (const n of ['e2e_floor_occupancy', 'e2e_inspector_floor']) {
      const w = src[n]
      expect(w, n).toContain('NORMALISASI JAM SIM')
      expect(w, n).toContain('window.__setTime(480)')
      expect(w, n).toContain("s.get(\"lunch\", 0) == 0 and s.get(\"lunchWalk\", 0) == 0")
      // urutan: normalisasi harus muncul sebelum pemakaian baseline/seleksi
      expect(w.indexOf('NORMALISASI JAM SIM'), n)
        .toBeGreaterThan(-1)
      expect(w.indexOf('occ_initial = ev(') >= 0
        ? w.indexOf('occ_initial = ev(') : w.indexOf('floor_initial = ev('), n)
        .toBeGreaterThan(w.indexOf('NORMALISASI JAM SIM'))
    }
    // Pola lama: setTime(480) langsung disusul seleksi agen TANPA guard lunch
    expect(src['e2e_inspector_floor']).not.toContain(
      'ev("window.__setTime(480)")\n        ev("window.__wfsSceneSelect')
  })

  it('siklus 276 — exit code jujur di probe lantai (dulu FAIL dicetak tapi exit 0)', () => {
    // e2e_floor_occupancy & e2e_inspector_floor: verdict tidak dipropagasi —
    // main() tanpa return → sys.exit(None) == 0 walau "FAIL" tercetak. Cron
    // tidak bisa membedakan hijau vs merah. Kontrak: sys.exit(main()) + return 0/1.
    for (const n of ['e2e_floor_occupancy', 'e2e_inspector_floor']) {
      expect(src[n], n).toContain('return 0 if ok else 1')
      expect(src[n], n).toContain('sys.exit(main())')
      expect(src[n], n).not.toMatch(new RegExp(`^\\s*main\\(\\)\\s*$`, 'm'))
    }
  })

  it('office_phase 199 tak ter-regresi: chip fase + __setTime(720) + deadline 60', () => {
    expect(src[NEW_199]).toContain('.hud .phase-chip')
    expect(src[NEW_199]).toContain('__setTime(720)')
    expect(src[NEW_199]).toContain('deadline = time.time() + 60')
    expect(src[NEW_199]).toContain('Istirahat makan siang')
  })
})
