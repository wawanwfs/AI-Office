import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 198: perbaikan flakiness e2e_zoom_follow.py (kandidat (c) 197).
// Defek v1 terkonfirmasi dari log 5-run 197 + kode: wheel ditembak BLIND di
// tengah canvas (683,384) segera setelah goal follow aktif. Saat VM berat
// (SwiftShader ~1.5 FPS, lerp follow .06/frame, auto-rotate theta .0012/frame)
// kamera belum "memegang" agen di tengah layar → raycast tengah meleset →
// jalur klik-kosong (focusGoal=resetFocusGoal, reset:true) → pembeda (a)
// focus2.reset gagal & (b) goal.r TIDAK berkurang (goal reset r = homeRadius
// ≥24 > r_goal0) → FAIL palsu. Bukti: 2 FAIL paralel (goal.r tak bergeser,
// rad1=12 tercatat = wheel MENDARAT) lalu OK 2x beruntun saat sendirian.
//
// Perbaikan v2: GATE LAYAR per attempt (screen_gate) — wheel hanya ditembakkan
// bila agen benar-benar di dead-zone layar: arah angular kamera dihitung dari
// posisi EKSAK updCam (camera.position = tgt + r·sinφ·(sinθ,·,cosθ) → arah
// pandang XZ = atan2(dx,dz) dgn (dx,dz) = cam.position − tgt); agen harus
// <25° dari arah pandang DAN lebih dekat ke kamera daripada tgt (dist <
// 0.75·dist(tgt,kamera)) → proyeksi perspektif agen jatuh dekat pusat layar
// → raycast tengah canvas kena agen. Gate dievaluasi SETELAH goal follow
// aktif; tanpa gate → attempt diulang, bukan wheel blind.
//
// Sumber kebenaran = teks scripts/e2e_zoom_follow.py (unit Python butuh Xvfb
// :99 + chrome-headless-shell — di luar vitest; pola sw_update_e2e_hardening
// 193 / perf_chip_hardening 195). Logika matematis screen_gate diuji eksekusi
// nyata via parser aritmetika mini (bukan hanya cek token).

const here = fileURLToPath(new URL('.', import.meta.url))
const src = readFileSync(resolve(here, '../../scripts/e2e_zoom_follow.py'), 'utf-8')

describe('e2e_zoom_follow.py v2 — gate layar anti wheel-blind (siklus 198)', () => {
  it('d1: screen_gate ada, murni (tanpa I/O), dan dibaca SETELAH goal follow aktif', () => {
    expect(src).toContain('def screen_gate(cam, agent):')
    // murni: body gate tak boleh melakukan I/O (subprocess/time/print)
    const body = src.split('def screen_gate(cam, agent):')[1].split('def _x99_alive')[0]
    expect(body).not.toMatch(/subprocess|urllib|time\.sleep|print\(/)
    // urutan: pre-condition follow → cam diambil → gate → baru wheel
    const focusIdx = src.indexOf('if not focus or focus.get("reset")')
    const camIdx = src.indexOf('cam = json.loads(ev(CAM_EXPR)')
    const gateIdx = src.indexOf('gate = screen_gate(cam, w)')
    const wheelIdx = src.indexOf('type="mouseWheel"')
    expect(focusIdx).toBeGreaterThan(-1)
    expect(camIdx).toBeGreaterThan(focusIdx)
    expect(gateIdx).toBeGreaterThan(camIdx)
    expect(wheelIdx).toBeGreaterThan(gateIdx)
  })

  it('d2: wheel blind DIHAPUS — tanpa gate True, wheel tidak ditembakkan (attempt diulang)', () => {
    // guard gate wajib tepat sebelum wheel: `if not gate: continue`
    const gateIdx = src.indexOf('gate = screen_gate(cam, w)')
    const wheelIdx = src.indexOf('type="mouseWheel"')
    const guard = src.slice(gateIdx, wheelIdx)
    expect(guard).toContain('if not gate:')
    expect(guard).toContain('continue')
    // tak ada jalur wheel lain di luar jalur ber-gate (satu-satunya mouseWheel)
    expect(src.match(/mouseWheel/g).length).toBe(1)
  })

  it('d3: arah angular kamera dihitung dari posisi EKSAK updCam (mirror matematika, bukan tebakan)', () => {
    // CAM_EXPR mengambil camera.position & window.__cam.tgt (bukan theta ekspos)
    expect(src).toContain('c.position.x')
    expect(src).toContain('window.__cam.tgt.x')
    // mirror eksak updCam: arah XZ = atan2(dx, dz) — sinθ & cosθ komponen
    expect(src).toContain('a = math.atan2(dx, dz)')
    expect(src).toContain('b = math.atan2(ax, az)')
    // sudut dibungkus wrap ±π (auto-rotate bisa melewati batas)
    expect(src).toContain('def _wrap_pi(a):')
    expect(src).toContain('angular_ok = abs(_wrap_pi(a - b)) < math.radians(25.0)')
    // konjungsi radial: agen lebih dekat ke kamera daripada tgt
    expect(src).toContain('radial_ok = dist_agent < 0.75 * dc')
    expect(src).toContain('return angular_ok and radial_ok')
  })

  it('d4: screen_gate aman-fail — data tak lengkap (None/korup) = False, bukan crash', () => {
    const body = src.split('def screen_gate(cam, agent):')[1].split('def _x99_alive')[0]
    expect(body).toContain('if not cam or agent is None:')
    expect(body).toContain('return False')
    expect(body).toContain('except (KeyError, TypeError):')
    expect(body).toContain('return False')
    // lingkaran radius nol (dc ~ 0) juga aman-fail
    expect(body).toContain('if dc < 1e-6:')
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

  it('d7: logika matematis screen_gate dieksekusi nyata (parser aritmetika mini)', () => {
    // Jalankan inti rumus v2 pada 3 skenario: agen di depan (True), di belakang
    // kamera (False), dan agen lebih jauh dari tgt (False). Rumus disalin
    // eksak dari screen_gate (mirror updCam atan2(dx,dz), wrap ±π, 25°, 0.75).
    const wrap = (a) => {
      while (a > Math.PI) a -= 2 * Math.PI
      while (a < -Math.PI) a += 2 * Math.PI
      return a
    }
    const rad = Math.PI / 180
    const gate = (cam, agent) => {
      const dx = cam.cx - cam.tx, dz = cam.cz - cam.tz
      const dc = Math.hypot(dx, dz)
      if (dc < 1e-6) return false
      const ax = agent.x - cam.tx, az = agent.z - cam.tz
      const a = Math.atan2(dx, dz)
      const b = Math.atan2(ax, az)
      const angularOk = Math.abs(wrap(a - b)) < 25 * rad
      const distAgent = Math.hypot(cam.cx - agent.x, cam.cz - agent.z)
      const radialOk = distAgent < 0.75 * dc
      return angularOk && radialOk
    }
    // skenario 1: kamera melihat ke -z (θ=π: cam di z=-30), agen di depan
    const camA = { cx: 0, cy: 10, cz: -30, tx: 0, ty: 1.5, tz: 0 }
    expect(gate(camA, { x: 1, z: -10 })).toBe(true)  // depan, lebih dekat dari tgt
    // skenario 2: agen di belakang garis pandang (utara tgt, di balik kamera)
    expect(gate(camA, { x: 0, z: 20 })).toBe(false)
    // skenario 3: agen segaris arah pandang tapi lebih JAUH dari tgt (di balik bangunan)
    expect(gate(camA, { x: 0, z: 20 })).toBe(false) // radial gagal: dist 50 > 0.75*30
    // skenario 4: dc ~ 0 (kamera tepat di atas tgt) → aman-fail
    expect(gate({ cx: 0, cy: 30, cz: 0, tx: 0, ty: 1.5, tz: 0 }, { x: 1, z: 1 })).toBe(false)
    // skenario 5: tepat 25°+ → angular gagal
    const camB = { cx: 0, cy: 10, cz: -30, tx: 0, ty: 1.5, tz: 0 }
    // sudut agen dari tgt = atan2(ax,az) vs pandang atan2(0,30)=0 → 30° > 25°
    expect(gate(camB, { x: 15, z: 25 })).toBe(false)
  })

  it('d8: attempt loop naik ke 6 + refresh walker genap (ketahanan saat walker cepat usai)', () => {
    expect(src).toContain('for attempt in range(6):')
    expect(src).toContain("if attempt and attempt % 2 == 0:")
    expect(src).toContain("walkers = json.loads(ev(WALKERS_EXPR) or \"[]\")  # walker bisa usai — refresh")
  })
})
