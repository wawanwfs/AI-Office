import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'

// drift-gate — siklus 212: SUPERSET hq_proxy.py (pola 206, duplikat stale ke-5).
//
// Latar (audit backlog 211c): backend/hq_proxy.py = server UI :9503 mode-repo
// yang dipakai scripts/test_runtime_layout.py + backend/test_hq_proxy.py (11
// test pytest yang TIDAK jalan di CI). Ternyata BUKAN sekadar duplikat mati —
// ia punya SATU hardening yang tidak dimiliki superset produksi:
// _security_headers() (X-Content-Type-Options + Referrer-Policy) di
// end_headers(). Pola 206 TERBALIK: repo lebih maju, produksi tertinggal.
// Ditambah bug nyata: hq_proxy memakai TCPServer single-thread — SSE
// /wfs-api/events membekukan seluruh server mode-repo.
//
// Solusi (pola 206-209): fitur unik diserap superset backend_live/
// wfs_hq_server.py; duplikat + test lama dihapus; test_runtime_layout.py
// kini membangun layout runtime dari superset produksi asli (wfs_hq_server +
// wfs_server + wfs_tasks/wfs_orders flat). Deploy via scripts/apply_wfs_hq_server.py
// (smoke kini 7 poin — poin 7 = header keamanan).

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'backend_live/wfs_hq_server.py')
const APPLY = resolve(REPO, 'scripts/apply_wfs_hq_server.py')
const LAYOUT = resolve(REPO, 'scripts/test_runtime_layout.py')
const DST = '/home/agentuser/wfs-hq/server.py'
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

describe('drift-gate superset hq_proxy (siklus 212)', () => {
  it('duplikat stale backend/hq_proxy.py + test lama sudah dihapus dari repo', () => {
    expect(existsSync(resolve(REPO, 'backend/hq_proxy.py'))).toBe(false)
    expect(existsSync(resolve(REPO, 'backend/test_hq_proxy.py'))).toBe(false)
  })

  it('fitur unik hq_proxy HIDUP di superset: _security_headers di end_headers', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('def _security_headers()')
    expect(s).toContain('X-Content-Type-Options')
    expect(s).toContain('Referrer-Policy')
    // MENGALIR lewat end_headers() — semua jalur respons mewarisi.
    const eh = s.slice(s.indexOf('class H('), s.indexOf('def _serve_static'))
    expect(eh).toContain('for name, value in _security_headers():')
  })

  it('kontrak end_headers eksak: Cache-Control lalu loop header keamanan', () => {
    const s = readFileSync(SRC, 'utf-8')
    const eh = s.slice(s.indexOf('def end_headers'), s.indexOf('def _serve_static'))
    expect(eh).toContain("send_header('Cache-Control'")
    expect(eh).toContain('for name, value in _security_headers():')
    // Literal kedua header hidup di fungsi sumber (satu titik kebenaran).
    const fn = s.slice(s.indexOf('def _security_headers()'), s.indexOf('class H('))
    expect(fn.indexOf('X-Content-Type-Options')).toBeGreaterThan(-1)
    expect(fn.indexOf('Referrer-Policy')).toBeGreaterThan(fn.indexOf('X-Content-Type-Options'))
  })

  it('ThreadingTCPServer tetap satu class untuk semua mode (SSE tidak membekukan UI)', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('daemon_threads = True')
    expect(s.replace(/\n#.*/g, '')).not.toMatch(/socketserver\.TCPServer\(\("0\.0\.0\.0"/)
  })

  it('test_runtime_layout membangun layout dari superset produksi asli', () => {
    const t = readFileSync(LAYOUT, 'utf-8')
    expect(t).toContain("live / 'wfs_hq_server.py'")
    expect(t).toContain("live / 'wfs_server.py'")
    expect(t).toContain("live / 'wfs_tasks.py'")
    expect(t).toContain('hq_ui_server')
    expect(t).not.toContain('import hq_proxy')
    expect(t).not.toContain('hq_proxy.H')
    expect(t).not.toContain('hq_proxy.GATEWAY')
  })

  it('apply script smoke kini 7 poin — poin 7 verifikasi header keamanan', () => {
    const a = readFileSync(APPLY, 'utf-8')
    expect(a).toContain('server.py.bak-')
    expect(a).toContain('py_compile')
    expect(a).toContain('def smoke(')
    expect(a).toContain('_rollback_to(bak)')
    expect(a).toContain('x-content-type-options')
    expect(a).toContain('referrer-policy')
    expect(a).toContain('security headers hilang')
  })

  it('file live produksi IDENTIK dgn sumber ter-track (drift tak boleh kembali)', () => {
    // CI-safe (siklus 210): file live absen di runner = skip DI RUNNER SAJA;
    // di VM produksi gate tetap KETAT.
    if (!existsSync(DST)) return
    expect(sha(DST)).toBe(sha(SRC))
  })
})
