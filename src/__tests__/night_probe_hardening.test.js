import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 196: hardening seragam 6 probe night (sky/wall/ceil/board/title/trim).
// Defek kelas 194/195 yang ditemukan & ditambal di SEMUA 6 file:
//   d1 — socket.create_connection TANPA timeout + handshake recv(1) per-byte
//        TANPA cek EOF → bisa menggantung tanpa batas (chrome mati di tengah
//        handshake = loop selamanya karena b'' tak pernah raise).
//   d2 — loop baca reply cmd() tanpa toleransi reply hilang (skrip lain crash
//        TypeError saat transport timeout) + ev()/shot() tanpa guard None.
//   d3 — gate visual byte-500KB polos TANPA gate piksel 194/195 (jebakan
//        "langit-saja" gradien lolos byte tapi DEAD piksel).
// Sumber kebenaran = teks skrip (unit live butuh Xvfb :99 + chrome — di luar
// vitest; pola shot_mobile.test.js / perf_chip_hardening.test.js).

const here = fileURLToPath(new URL('.', import.meta.url))
const PROBES = ['sky', 'wall', 'ceil', 'board', 'title', 'trim']
const srcOf = (p) =>
  readFileSync(resolve(here, `../../scripts/e2e_${p}_night.py`), 'utf-8')

describe('night probes — hardening seragam siklus 196 (6 file)', () => {
  it.each(PROBES)('%s: d1 — connect timeout WS_TIMEOUT_S + handshake deadline & cek EOF', (p) => {
    const src = srcOf(p)
    expect(src).toContain('WS_TIMEOUT_S = 60')
    expect(src).toContain(
      'socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)')
    // handshake: deadline + EOF guard (dulu recv(1) tanpa cek — hang selamanya)
    expect(src).toContain('s.settimeout(WS_TIMEOUT_S)  # d1: handshake tanpa deadline = hang selamanya')
    expect(src).toContain('raise ConnectionResetError("EOF saat handshake WS")')
  })

  it.each(PROBES)('%s: d2 — reply CDP hilang (socket.timeout) = None, bukan hang/crash', (p) => {
    const src = srcOf(p)
    expect(src).toContain('except socket.timeout:')
    expect(src).toContain('return None  # siklus 196: reply hilang/macet -> None (bukan hang)')
    // ev() + shot() guard reply None (2 titik: evaluate + captureScreenshot)
    expect(src.match(/reply hilang \(timeout\)/g)?.length).toBeGreaterThanOrEqual(2)
    // per-permintaan timeout dipasang setelah sendall
    expect(src).toContain('s.settimeout(WS_TIMEOUT_S)  # per-permintaan CDP')
  })

  it.each(PROBES)('%s: d3 — gate piksel png_stats (day & night) berlapis byte gate', (p) => {
    const src = srcOf(p)
    // png_stats dimuat by path (pola deploy.py — nama generik rawan resolve)
    expect(src).toContain('wfs_png_stats')
    expect(src).toContain('import importlib.util as _ilu')
    expect(src).toContain('("day", OUT_DAY), ("night", OUT_NIGHT)')
    expect(src).toContain('png_mod.alive_verdict(st)')
    expect(src).toContain('decode gagal: {e}')  // decode gagal = DEAD, bukan crash
    expect(src).toContain("fails.append(f\"pixels_{tag}\")")
    // byte gate lama TETAP berlapis (tidak digantikan)
    expect(src).toContain('if sz_day < 500_000 or sz_night < 500_000:')
  })

  it.each(PROBES)('%s: kriteria inti lama tetap utuh — hook night + screenshot day/night', (p) => {
    const src = srcOf(p)
    expect(src).toContain('window.__setTime')
    expect(src).toContain('captureScreenshot')
    expect(src).toMatch(/OUT_DAY|OUT_NIGHT/)
  })

  it('png_stats.py tetap menyediakan API yang dipakai gate (png_stats + alive_verdict)', () => {
    const src = readFileSync(resolve(here, '../../scripts/png_stats.py'), 'utf-8')
    expect(src).toContain('def png_stats(')
    expect(src).toContain('def alive_verdict(')
  })
})
