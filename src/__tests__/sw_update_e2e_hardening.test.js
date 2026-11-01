import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 193: hardening TES3 e2e_sw_update.py (sisa catatan jujur 192 — flaky
// "polling-loop kecil" ~1/run). Tiga vektor ditutup di probe:
//  v1 reply CDP bisa hilang saat navigasi reload (evaluate awaitPromise vs
//     context destroyed) → TimeoutError membunuh seluruh run → poll body kini
//     try/except (bacaan gagal = inkonklusif, loop lanjut).
//  v2 klik 'Muat ulang' dulunya dibuang diam-diam ('no-btn' tak tercatat) →
//     kini hasil klik dicatat + diulang sepanjang loop (window 18 poll).
//  v3 TES5 dieksekusi tepat setelah break yang bisa terjadi di jendela
//     navigasi → kini retry sekali (5 dtk) sebelum FAIL bersih.
// Pola fixed-delay 182/183 dipertahankan (sleep di Python, TANPA polling loop
// di dalam evaluate). Kriteria sukses TIDAK berubah: ctrlUrl = skrip fake.
// Sumber kebenaran = teks scripts/e2e_sw_update.py (unit nyata butuh Xvfb :99 +
// chrome-headless-shell — di luar vitest; pola audio_mute_stale.test.js 188).

const here = fileURLToPath(new URL('.', import.meta.url))
const src = readFileSync(resolve(here, '../../scripts/e2e_sw_update.py'), 'utf-8')

describe('e2e_sw_update.py — hardening TES3 anti-flake (siklus 193)', () => {
  it('v1: poll body TES3 dibungkus try/except — reply CDP hilang saat reload tidak mematikan run', () => {
    expect(src).toContain('r3 = ev(T3_JS, await_p=True) or {}')
    expect(src).toContain('r3 = {"ev_err": type(e).__name__}')
    // except harus segera setelah ev(...) di blok try yang sama
    const t3body = src.split('T3_JS = """')[1].split('ok3 = bool')[0]
    expect(t3body).toContain('except Exception as e:')
  })

  it('v2: hasil klik dicatat + klik diulang sepanjang loop (window 18), bukan sekali dibuang diam', () => {
    expect(src).toContain('if clicks == 0 and i < 18:')
    expect(src).toContain('last_click = ev(CLICK_JS)')
    expect(src).toContain('last_click = "ev-err:" + type(e).__name__')
    expect(src).toContain('t3["clicks"] = clicks; t3["last_click"] = last_click; t3["polls"] = polls')
  })

  it('auditability pola mgMin 188: setiap poll ctrlUrl tercatat di t3["polls"]', () => {
    expect(src).toContain('polls.append(str(r3.get("ctrlUrl") or r3.get("ev_err") or "?"))')
  })

  it('v3: TES5 retry sekali (5 dtk) — evaluate di jendela navigasi tidak crash-kan run', () => {
    const t5region = src.split('# TES4+TES5')[1].split('res["tests"]["tes5_hooks_after"]')[0]
    expect(t5region).toContain('for attempt in range(2):')
    expect(t5region).toContain('time.sleep(5)')
  })

  it('FAIL verdict membawa detail diagnosis (E2E_SW_UPDATE_DETAIL: tes3/tes5/errors)', () => {
    expect(src).toContain('print("E2E_SW_UPDATE_DETAIL:", json.dumps(')
    const detail = src.split('E2E_SW_UPDATE_DETAIL:')[1].split('flush=True)')[0]
    expect(detail).toContain('tes3_reload_to_new')
    expect(detail).toContain('tes5_hooks_after')
    expect(detail).toContain('res["errors"][:3]')
  })

  it('kriteria sukses TIDAK berubah (ctrlUrl = skrip fake) + pola fixed-delay dipertahankan', () => {
    expect(src).toContain('endswith("e2e-sw-fake.js")')
    // JS dikangkangkan keluar loop (konstanta), sleep fixed-delay di Python —
    // tanpa polling loop di dalam evaluate (pelajaran 182/183).
    expect(src).toContain("CLICK_JS = \"\"\"(() => { const b = [...document.querySelectorAll('.sw-update button')]")
    expect(src).toContain('T3_JS = """(async () => {')
    expect(src).toContain('            time.sleep(1.5)')
  })
})
