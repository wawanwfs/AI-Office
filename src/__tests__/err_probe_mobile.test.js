import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 186: gate kesehatan MOBILE di smoketest wajib siklus — dulu
// scripts/e2e_err_probe.py hanya menguji desktop 1366x768; padahal user
// utama mengakses via HP dan regresi kelas dock/HUD mobile (siklus 184:
// dock 3-4 baris meluap kapsul/viewport @390/360px) tidak akan tertangkap
// gate desktop sama sekali. Sumber kebenaran = teks e2e_err_probe.py
// (unit nyata butuh Xvfb :99 + chrome-headless-shell — di luar vitest).

const here = fileURLToPath(new URL('.', import.meta.url))
const src = readFileSync(resolve(here, '../../scripts/e2e_err_probe.py'), 'utf-8')

describe('e2e_err_probe.py — mode MOBILE 390x844@2x + gate dock (kelas bug 184)', () => {
  it('konstanta viewport mobile: 390x844 dsf=2 + ambang PNG terpisah mobile/desktop', () => {
    expect(src).toContain('MOBILE_W, MOBILE_H, MOBILE_DSF = 390, 844, 2')
    expect(src).toContain('MIN_SHOT_BYTES = 300000')
    expect(src).toContain('MOBILE_MIN_SHOT_BYTES = 200000')
  })

  it('arg parsing: "mobile" memilih mode + viewport window-size mengikuti mode', () => {
    expect(src).toContain('mobile = "mobile" in args')
    expect(src).toContain('(MOBILE_W, MOBILE_H) if mobile else (1366, 768)')
    // window-size chrome dinamis (bukan hardcode 1366,768 tunggal)
    expect(src).toContain('f"--window-size={w},{h}"')
    // mode terekam di hasil JSON (auditability)
    expect(src).toContain('"mode": "mobile" if mobile else "desktop"')
  })

  it('viewport HP berlaku dari awal init scene: setDeviceMetricsOverride + Page.reload', () => {
    expect(src).toContain('Emulation.setDeviceMetricsOverride')
    expect(src).toContain('deviceScaleFactor=MOBILE_DSF, mobile=True')
    expect(src).toContain('Page.reload')
  })

  it('gate dock LIVE dari DOM: kotak tombol terakhir vs viewport & kapsul', () => {
    // bacaan geometri nyata (pelajaran 184: getBoundingClientRect, bukan clientHeight)
    expect(src).toContain("document.querySelector('.dock')")
    expect(src).toContain("dock.querySelectorAll('.ibtn')")
    expect(src).toContain('getBoundingClientRect()')
    // empat pembanding: lastRight<=vw, lastBottom<=vh, lastRight<=dockRight, lastBottom<=dockBottom
    expect(src).toContain('dk.get("lastRight", 9e9) <= dk.get("vw", 0) + 1')
    expect(src).toContain('dk.get("lastBottom", 9e9) <= dk.get("vh", 0) + 1')
    expect(src).toContain('dk.get("lastRight", 0) <= dk.get("dockRight", -1) + 1')
    expect(src).toContain('dk.get("lastBottom", 0) <= dk.get("dockBottom", -1) + 1')
  })

  it('gate dock adalah bagian dari keputusan clean (bukan catatan kaki)', () => {
    expect(src).toContain('res["dock_ok"]')
    expect(src).toContain('and (res.get("dock_ok", True))')
    // anti-poisoning: dock/btns hilang → err → FAIL
    expect(src).toContain("not dk.get(\"err\")")
  })

  it('mode DESKTOP tidak berubah perilaku (paritas siklus 185)', () => {
    // ambang & viewport desktop tetap literal
    expect(src).toContain('MOBILE_MIN_SHOT_BYTES if mobile else MIN_SHOT_BYTES')
    expect(src).not.toContain('shot_bytes"] > 300000') // lama sudah diganti konstanta
  })
})
