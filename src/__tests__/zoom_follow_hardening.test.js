import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 198: perbaikan flakiness e2e_zoom_follow.py (kandidat (c) 197).
//
// BUKTI (log 5-run 197 + run live siklus ini), bukan teori:
//  f1 EARLY-READ — v1 tidur 1.5 dtk setelah wheel lalu membaca radius sekali.
//     Lerp radius .06/frame di SwiftShader ~1.5 FPS butuh ±26 dtk utk 42→12
//     (95%): 0.94^(2.25)≈0.87 per 1.5 dtk → bar 2.0 tak tercapai → "radius
//     tidak bergeser: goal 20→15.2 rad 33.4→33.4" di log 197 (goal ikut
//     wheel; yang terlambat hanya PEMBACAAN radius aktual).
//  f2 CLAMP-STUCK — setelah satu wheel sukses, sph.radius=12 (clamp) →
//     attempt berikutnya r_goal0=min(12,24)=12 → d=zoomRadius(12,-40)-12=0 →
//     goal.r & radius tak bisa turun lagi → pembeda mustahil → FAIL berantai
//     attempt sisa (log 197: FAIL run-1/run-2 dgn goal.r tak bergeser).
//  f3 — draft gate layar angular (arah pandang dari cam−tgt) DIBUANG setelah
//     run live membuktikan: (a) tgt EKSAK di posisi agen saat follow aktif
//     (attempt[3]: tgt=(-3.84,2.10) vs agen=(-3.8,2.1)) dan wheel tetap sah
//     tanpa raycast (handler OfficeScene L636 langsung zoomRadius — TANPA
//     raycaster), (b) kamera di SwiftShader butuh puluhan dtk mengejar agen
//     → gate menutup attempt valid & run menggantung.
//
// Perbaikan v2: wheel ditembak tanpa gate (sah kapan pun), lalu f1 radius &
// goal di-POLL tiap 1.5 dtk (maks 30 dtk) sampai pembeda terpenuhi; follow
// juga di-poll konvergen (dist(__cam.tgt, agen) < 2) sebelum wheel; f2 tiap
// attempt diawali re-expand radius (wheel BAWAH + poll ≥22) bila terjepit
// clamp 12. Kriteria inti 121 TIDAK berubah (pembeda ganda focus tetap +
// goal.r turun + radius turun).
//
// Sumber kebenaran = teks scripts/e2e_zoom_follow.py (unit Python butuh Xvfb
// :99 + chrome-headless-shell — di luar vitest; pola sw_update_e2e_hardening
// 193 / perf_chip_hardening 195).

const here = fileURLToPath(new URL('.', import.meta.url))
const src = readFileSync(resolve(here, '../../scripts/e2e_zoom_follow.py'), 'utf-8')

describe('e2e_zoom_follow.py v2 — anti early-read & clamp-stuck (siklus 198)', () => {
  it('f1: radius & goal di-POLL konvergensi (maks 30 dtk), bukan sleep tunggal 1.5 dtk', () => {
    // poll loop sesudah wheel
    const wheelIdx = src.lastIndexOf('wheel(-1000)')
    expect(wheelIdx).toBeGreaterThan(-1)
    const poll = src.slice(wheelIdx)
    expect(poll).toContain('while time.time() - t0 < 30:')
    expect(poll).toContain('time.sleep(1.5)')
    expect(poll).toContain('focus2 = json.loads(ev(FOCUS_EXPR) or "null")')
    expect(poll).toContain('rad1 = json.loads(ev(RADIUS_EXPR) or "null")')
    // sleep(1.5) tunggal lama SETELAH wheel sudah tidak ada
    expect(poll).not.toContain('time.sleep(1.5)  # lerp radius (beberapa frame)')
  })

  it('f2: re-expand radius sebelum tiap attempt (wheel bawah + poll ≥22) — anti clamp-stuck', () => {
    const body = src.split('for attempt in range(6):')[1]
    expect(body).toContain('rad_pre = json.loads(ev(RADIUS_EXPR) or "null")')
    expect(body).toContain('if isinstance(rad_pre, (int, float)) and rad_pre < 22:')
    expect(body).toContain('wheel(1000)')
    expect(body).toContain('r_now >= 22')
    // re-expand berada SEBELUM klik agen (urutan benar)
    const reIdx = body.indexOf('rad_pre = json.loads')
    const clickIdx = body.indexOf('pj = json.loads(ev(proj_expr(')
    expect(reIdx).toBeGreaterThan(-1)
    expect(clickIdx).toBeGreaterThan(reIdx)
  })

  it('f3: TANPA gate layar angular — wheel sah tanpa raycast (handler L636 tanpa raycaster)', () => {
    expect(src).not.toContain('screen_gate')
    expect(src).not.toContain('atan2')
    // wheel langsung dari deltaY di handler scene (bukan jalur hit) — teks
    // probe mendokumentasikan dasar ini
    expect(src).toContain('TANPA raycaster')
  })

  it('poll konvergensi follow: tgt kamera dgn agen < 2 sebelum wheel', () => {
    expect(src).toContain('TGT_DIST_EXPR')
    expect(src).toContain('while time.time() - t0 < 15:')
    expect(src).toContain('d < 2.0')
    // urutan: follow poll SEBELUM wheel(-1000)
    const followIdx = src.indexOf('while time.time() - t0 < 15:')
    const wheelIdx = src.indexOf('wheel(-1000)')
    expect(followIdx).toBeGreaterThan(-1)
    expect(wheelIdx).toBeGreaterThan(followIdx)
  })

  it('d5: kriteria inti 121 UTUH — pembeda ganda (focus tetap + goal.r & radius turun) tak berubah', () => {
    expect(src).toContain('window.__setTime && window.__setTime(720)')
    expect(src).toContain('WALKERS_EXPR')
    // pre-condition goal follow aktif (reset:false)
    expect(src).toContain('if not focus or focus.get("reset") or not isinstance(focus.get("r"), (int, float)):')
    // pembeda (a) focus2 tidak reset, (b) goal_ok < r_goal0 - 2, (c) rad_ok < rad0 - 2
    expect(src).toContain('if focus2 and not focus2.get("reset"):')
    expect(src).toContain('goal_ok = isinstance(new_r, (int, float)) and new_r < r_goal0 - 2.0')
    expect(src).toContain('rad_ok = (isinstance(rad0, (int, float)) and isinstance(rad1, (int, float))')
    expect(src).toContain('and rad1 < rad0 - 2.0)')
    // deltaY wheel besar → terdorong clamp 12
    expect(src).toContain('deltaY=-1000')
  })

  it('d6: hardening 197 tak ter-regresi (WS timeout + EOF handshake + reply None tercatat)', () => {
    expect(src).toContain('WS_TIMEOUT_S = 60')
    expect(src).toContain('s.sock.settimeout(WS_TIMEOUT_S)')
    expect(src).toContain('raise ConnectionResetError("EOF saat handshake WS")')
    const cmdBody = src.split('def cmd(method, **params):')[1].split('def ev(')[0]
    expect(cmdBody).toContain('except socket.timeout:')
    expect(cmdBody).toContain('return None')
  })

  it('d8: attempt loop 6 + refresh walker genap (ketahanan saat walker cepat usai)', () => {
    expect(src).toContain('for attempt in range(6):')
    expect(src).toContain("if attempt and attempt % 2 == 0:")
    expect(src).toContain("walkers = json.loads(ev(WALKERS_EXPR) or \"[]\")  # walker bisa usai — refresh")
  })

  it('d9: reset-goal saat poll diperlakukan sebagai sinyal regresi nyata (keluar poll, bukan diabaikan)', () => {
    const poll = src.slice(src.lastIndexOf('wheel(-1000)'))
    expect(poll).toContain('elif focus2 and focus2.get("reset"):')
    expect(poll).toContain('break')
  })
})
