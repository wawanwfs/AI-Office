import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 195: hardening e2e_perf_chip.py (kandidat (c) 194 — audit tooling).
// Empat defek terkonfirmasi dari kode lama:
//  d1 Transport WS TANPA settimeout — satu-satunya probe e2e yang bisa
//     menggantung tanpa batas (chrome hidup tapi tak menjawab → recv blocking
//     selamanya; cron run bisa tergantung).
//  d2 Docstring menjanjikan "e2e_err paritas: 0 console error" sejak 147 tapi
//     Runtime/Log.enable tidak pernah dipanggil dan event console tak pernah
//     dikumpulkan (grep consoleAPICalled = nol di kode lama) — janji kosong.
//  d3 Gate scene-hidup cuma byte >300KB — proksi yang sudah dibuktikan bocor
//     siklus 194 (jebakan "langit-saja" gradien 378 KB lolos byte, scene mati
//     616 warna). Gate piksel png_stats.py wajib.
//  d4 Blok kode mati: evaluate __wfsSceneControls.__debugSun yang selalu
//     `return null` dan hasilnya tak pernah dipakai.
// Sumber kebenaran = teks scripts/e2e_perf_chip.py (unit nyata butuh Xvfb :99 +
// chrome-headless-shell — di luar vitest; pola sw_update_e2e_hardening 193).

const here = fileURLToPath(new URL('.', import.meta.url))
const src = readFileSync(resolve(here, '../../scripts/e2e_perf_chip.py'), 'utf-8')

describe('e2e_perf_chip.py — hardening anti-hang + parity + gate piksel (siklus 195)', () => {
  it('d1: transport WS memakai socket timeout (anti-hang) dan reply CDP gagal = None tercatat', () => {
    expect(src).toContain('WS_TIMEOUT_S = 60')
    expect(src).toContain('s.sock.settimeout(WS_TIMEOUT_S)')
    // recv di dalam cmd() dibungkus try/except — macet tidak membunuh run
    const cmdBody = src.split('def cmd(method, **params):')[1].split('cmd("Page.enable")')[0]
    expect(cmdBody).toContain('except (socket.timeout, ConnectionError):')
    expect(cmdBody).toContain('return None')
  })

  it('d2: parity console error NYATA — Runtime+Log.enable sebelum init, 3 sumber event dikumpulkan, ikut verdict', () => {
    // enable SEBELUM sleep 30 (scene init) — event tak terlewat
    const initIdx = src.indexOf('time.sleep(30)')
    expect(initIdx).toBeGreaterThan(-1)
    const enables = src.indexOf('cmd("Page.enable"); cmd("Runtime.enable"); cmd("Log.enable")')
    expect(enables).toBeGreaterThan(-1)
    expect(enables).toBeLessThan(initIdx)
    expect(src).toContain('"Runtime.consoleAPICalled"')
    expect(src).toContain('"Runtime.exceptionThrown"')
    expect(src).toContain('"Log.entryAdded"')
    expect(src).toContain('if "net::ERR" not in src.get("text", "")')
    // ikut verdict OK/FAIL
    const verdict = src.split('ok = (')[1].split(')')[0]
    expect(verdict).toContain('results["clean"]')
  })

  it('d3: gate piksel png_stats (warna>=1500 & nonbg>=4%) wajib utk verdict — byte gate tetap berlapis', () => {
    expect(src).toContain('spec_from_file_location(\n    "wfs_png_stats"')
    expect(src).toContain('png_mod.alive_verdict(px)')
    const verdict = src.split('ok = (')[1].split(')')[0]
    expect(verdict).toContain('results["pixels_ok"]')
    expect(verdict).toContain('results["shot_ok"]')
    // decode gagal = DEAD, bukan crash probe
    expect(src).toContain('px, px_ok, px_why = {"err": str(e)}, False, "decode gagal"')
  })

  it('d4: kode mati __debugSun dihapus — degradasi dibaca dari state __perf, bukan evaluate yang selalu null', () => {
    expect(src).not.toContain('__debugSun')
    expect(src).toContain('results["degraded_seen"] = bool(perf and (perf.get("shadowLevel", 0) > 0 or perf.get("downgraded")))')
  })

  it('FAIL verdict membawa detail diagnosis (E2E_PERF_CHIP_DETAIL: 5 gate + errors)', () => {
    expect(src).toContain('print("E2E_PERF_CHIP_DETAIL:", json.dumps(')
    const detail = src.split('E2E_PERF_CHIP_DETAIL:')[1].split('flush=True)')[0]
    expect(detail).toContain('"perf_live"')
    expect(detail).toContain('"pixels_why"')
    expect(detail).toContain('"console_errors"')
  })

  it('kriteria inti 147 TIDAK berubah: __perf live, chip GPU/FPS, byte >300KB, Xvfb :99 transport', () => {
    expect(src).toContain('results["perf_live"] = bool(perf and perf.get("fps", 0) > 0)')
    expect(src).toContain('"GPU" in chip.get("label", "") and "FPS" in chip.get("label", "")')
    expect(src).toContain('results["shot_ok"] = results["shot_bytes"] > 300000')
    expect(src).toContain('"--enable-unsafe-swiftshader", "--window-size=1366,768"')
  })
})
