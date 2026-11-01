import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 197: hardening transport WS seluruh probe e2e/shot non-night (58 file)
// — paritas penuh d1 196 + e2a 195 ke SEMUA probe:
//   d1 — WS_TIMEOUT_S = 60 level modul + create_connection(timeout=WS_TIMEOUT_S)
//        + handshake settimeout + EOF guard (recv b'' saat chrome mati di tengah
//        handshake dulu loop selamanya).
//   e2a — loop baca reply `for _ in range(N)` / `while True` kini punya
//        try/except socket.timeout dengan `return None` (reply macet/hilang =
//        None tercatat, bukan hang 10 jam via continue-60s maupun crash
//        TypeError), lalu `return None` di batas loop (di luar body for).
//   e2b — guard reply None di konsumen langsung: captureScreenshot (raise
//        RuntimeError jelas), evaluate tvwysiwyg/painter (SystemExit 1).
//   e2c — drain-loop event kini menolak pesan non-dict (isinstance guard).
// Sumber kebenaran = teks skrip (unit live butuh Xvfb :99 + chrome — di luar
// vitest; pola night_probe_hardening.test.js 196).

const here = fileURLToPath(new URL('.', import.meta.url))
const ALL = (await import('node:fs')).readdirSync(resolve(here, '../../scripts'))
  .filter((f) => /^e2e_.*\.py$/.test(f) || f === 'shot.py')
  .map((f) => `scripts/${f}`)
  .filter((f) => readFileSync(resolve(here, '../..', f), 'utf-8').includes('create_connection'))
const NIGHT = ALL.filter((f) => /e2e_(sky|wall|ceil|board|title|trim)_night\.py$/.test(f))
const REST = ALL.filter((f) => !NIGHT.includes(f))

describe('ws_transport_hardening siklus 197 — census', () => {
  it('census: 58 file non-night + 6 night = 64 file WS', () => {
    expect(ALL.length).toBe(64)
    expect(NIGHT.length).toBe(6)
    expect(REST.length).toBe(58)
  })
})

describe('ws_transport_hardening siklus 197 — d1 semua 64 file (termasuk night 196)', () => {
  it.each(ALL)('%s: connect timeout WS_TIMEOUT_S + EOF guard handshake', (f) => {
    const src = readFileSync(resolve(here, '../..', f), 'utf-8')
    expect(src).toContain('WS_TIMEOUT_S = 60')
    const conn = src.split('\n').filter((l) => l.includes('create_connection'))
    expect(conn.some((l) => l.includes('timeout=WS_TIMEOUT_S'))).toBe(true)
    expect(src).toContain('raise ConnectionResetError("EOF saat handshake WS")')
    // guard harus menerima bytes: c = <recv>.recv(1) SEBELUM if not c
    expect(src).toMatch(/c = (?:s\.sock|s)\.recv\(1\)\n[ \t]*if not c:/)
  })
})

describe('ws_transport_hardening siklus 197 — receiver settimeout benar', () => {
  it.each(ALL)('%s: s.settimeout (class→s.sock, inline→s) tidak tertukar', (f) => {
    const src = readFileSync(resolve(here, '../..', f), 'utf-8')
    const isClass = src.includes('class WS')
    if (isClass) {
      // instance WS tidak punya settimeout — wajib via s.sock
      expect(src).not.toMatch(/(?<![.\w])s[.]settimeout[(]WS_TIMEOUT_S[)]/)
    } else {
      expect(src).not.toContain('s.sock.settimeout(WS_TIMEOUT_S)')
    }
    // konstanta WS_TIMEOUT_S tidak boleh terkurung di dalam method (indent)
    expect(src).not.toMatch(/^[ \t]+WS_TIMEOUT_S = 60/m)
  })
})

describe('ws_transport_hardening siklus 197 — e2a reply-hilang aman (58 non-night)', () => {
  it.each(REST)('%s: loop baca reply punya except socket.timeout + mekanisme reply-hilang', (f) => {
    const src = readFileSync(resolve(here, '../..', f), 'utf-8')
    // tiap loop yang membaca ws.recv/s.recv WAJIB punya except di body-nya
    const lines = src.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)(?:for _ in range\(|while True:)/)
      if (!m) continue
      let j = i + 1
      const body = []
      while (j < lines.length &&
             (lines[j].trim() === '' ||
              lines[j].length - lines[j].trimStart().length > m[1].length)) {
        body.push(lines[j]); j++
      }
      const b = body.join('\n')
      if ((b.includes('ws.recv') || /\bs\.recv\(/.test(b)) && !b.includes('except')) {
        throw new Error(`${f}:${i + 1} loop recv tanpa except`)
      }
    }
    // reply-hilang harus berujung jelas: None tercatat (marker 197) ATAU
    // raise TimeoutError eksplisit (3 file lazy 30×10s) ATAU pump-loop
    // return-None deadline (pola 186-193: wait_id None + ev r-guard) ATAU
    // guard ev r-or-{} (5 file cmd/ev klasik)
    const ok = /return None {2}# siklus 197:/.test(src) ||
      src.includes('raise TimeoutError') ||
      /except \(socket\.timeout, TimeoutError\)/.test(src) ||
      /\(\(r or \{\}\)\.get\("result"\)/.test(src) ||
      (src.includes('def pump') && src.includes('msgq') && /except queue\.Empty:[\s\S]{0,200}?return None/.test(src))
    expect(ok).toBe(true)
  })
})

describe('ws_transport_hardening siklus 197 — konsumen reply None aman', () => {
  it.each(['scripts/e2e_gl_lost.py', 'scripts/e2e_lunch_chat.py',
           'scripts/e2e_soak_day.py', 'scripts/e2e_shot.py'])(
    '%s: captureScreenshot None -> RuntimeError jelas', (f) => {
      const src = readFileSync(resolve(here, '../..', f), 'utf-8')
      expect(src).toContain('reply captureScreenshot hilang (r=None)')
    })
  it.each(['scripts/e2e_tvwysiwyg.py', 'scripts/e2e_tvwysiwyg_painter.py'])(
    '%s: evaluate None -> SystemExit(1) dengan pesan', (f) => {
      const src = readFileSync(resolve(here, '../..', f), 'utf-8')
      expect(src).toContain('(((r or {}).get("result") or {}).get("result") or {}).get("value")')
      expect(src).toContain('reply evaluate hilang (r=None)')
    })
  it.each(['scripts/e2e_sky_night.py', 'scripts/e2e_wall_night.py',
           'scripts/e2e_ceil_night.py', 'scripts/e2e_board_night.py',
           'scripts/e2e_title_night.py', 'scripts/e2e_trim_night.py'])(
    '%s (night 196): guard r is None sebelum cek "result"', (f) => {
      const src = readFileSync(resolve(here, '../..', f), 'utf-8')
      expect(src).toContain('if r is None or "result" not in r:')
    })
  it.each(['scripts/e2e_err_probe.py', 'scripts/e2e_perf_chip.py',
           'scripts/e2e_lazy_modals.py', 'scripts/e2e_sw_update.py'])(
    '%s: drain event menolak pesan non-dict (isinstance guard)', (f) => {
      const src = readFileSync(resolve(here, '../..', f), 'utf-8')
      expect(src).toContain('if not isinstance(r, dict):')
    })
})

describe('ws_transport_hardening siklus 197 — 3 file lazy desain loop 30×10s dipertahankan', () => {
  it.each(['scripts/e2e_lazy_modals.py', 'scripts/e2e_taskboard_lazy.py', 'scripts/e2e_sw_update.py'])(
    '%s: handshake settimeout(10) TIDAK dinaikkan ( TimeoutError eksplisit tetap bermakna)', (f) => {
      const src = readFileSync(resolve(here, '../..', f), 'utf-8')
      expect(src).toMatch(/s\.sock\.settimeout\(10\) {2}# berlaku SEJAK handshake/)
      // connect timeout tetap diperketat WS_TIMEOUT_S (handshake TCP saja)
      expect(src).toContain('timeout=WS_TIMEOUT_S')
    })
})

describe('ws_transport_hardening siklus 197 — kriteria inti probe tak berubah', () => {
  it('probe wajib err_probe: kriteria hooks/scene/pixels tetap utuh', () => {
    const src = readFileSync(resolve(here, '../../scripts/e2e_err_probe.py'), 'utf-8')
    expect(src).toContain('"Scene init failed"')
    expect(src).toContain('__agentData')
    expect(src).toContain('png_mod.png_stats(data)')
    expect(src).toContain('MIN_SHOT_BYTES = 300000')
  })
  it('night probes: gate piksel + byte gate 196 tetap utuh', () => {
    for (const f of NIGHT) {
      const src = readFileSync(resolve(here, '../..', f), 'utf-8')
      expect(src).toContain('png_mod.alive_verdict(st)')
      expect(src).toContain('if sz_day < 500_000 or sz_night < 500_000:')
    }
  })
})
