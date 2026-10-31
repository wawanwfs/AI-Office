import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 187: mode MOBILE di shot.py (kandidat (c) siklus 186) — screenshot
// visual HP kini benar-benar viewport HP: 390x844 dsf=2 dari awal init scene
// (paritas mode mobile e2e_err_probe.py siklus 186). Dulu "screenshot mobile"
// cuma --window-size kecil TANPA device-metrics override → layout/dsf beda
// dari HP nyata, tes visual dock/HUD mobile menyesatkan. Sumber kebenaran =
// teks scripts/shot.py (unit nyata butuh Xvfb :99 + chrome-headless-shell —
// di luar vitest; pola err_probe_mobile.test.js siklus 186).

const here = fileURLToPath(new URL('.', import.meta.url))
const src = readFileSync(resolve(here, '../../scripts/shot.py'), 'utf-8')

describe('shot.py — mode MOBILE 390x844@2x paritas e2e_err_probe (siklus 186)', () => {
  it('konstanta viewport mobile: 390x844 dsf=2 (satu sumber, sama dgn err_probe)', () => {
    expect(src).toContain('MOBILE_W, MOBILE_H, MOBILE_DSF = 390, 844, 2')
  })

  it('arg parsing: "mobile" memilih mode + default W/H mengikuti mode', () => {
    expect(src).toContain('mobile = "mobile" in args')
    // flag mobile dikeluarkan dari daftar arg posisional (bukan dihitung W/H/out)
    expect(src).toContain('args = [a for a in args if a != "mobile"]')
    expect(src).toContain('(MOBILE_W if mobile else 1366)')
    expect(src).toContain('(MOBILE_H if mobile else 768)')
  })

  it('viewport HP berlaku dari awal init scene: setDeviceMetricsOverride + Page.reload', () => {
    expect(src).toContain('Emulation.setDeviceMetricsOverride')
    expect(src).toContain('deviceScaleFactor=MOBILE_DSF, mobile=True')
    expect(src).toContain('Page.reload')
  })

  it('mode DESKTOP tidak berubah (tanpa override, jalur lama utuh)', () => {
    // override HANYA di cabang if mobile — desktop tetap window-size + sleep 18
    expect(src).toContain('if mobile:')
    expect(src).toContain('time.sleep(18)  # scene init + settle visual (paritas shot.sh)')
  })

  it('keluaran mencantumkan mode (auditability): "mobile 390x844@2x" / desktop', () => {
    expect(src).toContain('f"mobile {MOBILE_W}x{MOBILE_H}@{MOBILE_DSF}x" if mobile else "desktop"')
  })

  it('dokumen pakai: arg mobile tercantum di docstring pemakaian', () => {
    expect(src).toContain('python3 scripts/shot.py W H out.png [mobile]')
  })
})
