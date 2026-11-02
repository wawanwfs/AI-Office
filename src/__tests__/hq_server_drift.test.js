import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'

// drift-gate — siklus 206: SATU SUMBER server produksi wfs-hq (:9503).
//
// Latar (audit drift siklus 206): repo punya backend/server_proxy.py (hardening
// 2026-10-28, ada test) TANPA fitur live; produksi ~/wfs-hq/server.py punya
// fitur siklus 154-161 TANPA hardening. Dua sumber yang saling meleset —
// hardening tak pernah hidup di produksi, fitur live tak pernah ada di repo.
// Solusi: backend_live/wfs_hq_server.py = superset ter-track; deploy hanya via
// scripts/apply_wfs_hq_server.py (backup + compile-check + smoke + auto-rollback).
//
// Sumber kebenaran = sha256 file. Tes live membandingkan produksi nyata
// (eksperimen valid: satu file statis; deployment backend TIDAK melalui build).

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'backend_live/wfs_hq_server.py')
const SRC_TEST = resolve(REPO, 'backend_live/test_wfs_hq_server.py')
const APPLY = resolve(REPO, 'scripts/apply_wfs_hq_server.py')
const DST = '/home/agentuser/wfs-hq/server.py'
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

describe('drift-gate server produksi wfs-hq (siklus 206)', () => {
  it('sumber superset backend_live/wfs_hq_server.py ada (single source of truth)', () => {
    expect(existsSync(SRC)).toBe(true)
  })

  it('server_proxy.py LAMA sudah dihapus dari repo (duplikat mati yang bikin drift)', () => {
    expect(existsSync(resolve(REPO, 'backend/server_proxy.py'))).toBe(false)
    expect(existsSync(resolve(REPO, 'backend/test_server_proxy.py'))).toBe(false)
  })

  it('file live produksi IDENTIK dgn sumber ter-track (drift dua arah tak boleh kembali)', () => {
    // CI-safe (siklus 210): runner GitHub tidak punya ~/wfs-hq — file live
    // absen = assertion sha di-skip DI RUNNER SAJA. Di VM produksi gate ini
    // tetap KETAT (file ada); deploy salah = vitest lokal/deploy-gate merah.
    if (!existsSync(DST)) return
    expect(sha(DST)).toBe(sha(SRC))
  })

  it('test superset ikut ter-track dan menarget modul baru (bukan server_proxy)', () => {
    const t = readFileSync(SRC_TEST, 'utf-8')
    expect(t).toContain('import wfs_hq_server')
    expect(t).not.toContain('import server_proxy')
  })

  it('hardening 2026-10-28 HIDUP di sumber: parse toleran + cap 5MB di KEDUA jalur proxy', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('_parse_content_length')
    expect(s).toContain('MAX_PROXY_BODY = 5 * 1024 * 1024')
    // kedua jalur POST (gateway + bantuin) wajib lewat guard yang sama
    const proxy = s.slice(s.indexOf('def _proxy('), s.indexOf('def _proxy_bantuin('))
    const bantuin = s.slice(s.indexOf('def _proxy_bantuin('), s.indexOf('def do_POST('))
    for (const seg of [proxy, bantuin]) {
      expect(seg).toContain('_parse_content_length(self.headers.get("Content-Length", 0))')
      expect(seg).toContain('if ln > MAX_PROXY_BODY:')
    }
    // tidak ada lagi int() telanjang pada Content-Length di file server
    expect(s.replace(/\n#.*/g, '')).not.toMatch(/int\(self\.headers\.get\("Content-Length"/)
  })

  it('fitur live siklus 154-161 utuh di sumber superset', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('_proxy_stream_events')            // SSE 154
    expect(s).toContain('timeout=90')                       // keepalive guard
    expect(s).toContain('/app')                             // 159
    expect(s).toContain('/landing')                         // 159
    expect(s).toContain('/admin')                           // 161
    expect(s).toContain('/cs-widget/')                      // 160
    expect(s).toContain('_proxy_bantuin')                   // 161
    expect(s).toContain('do_DELETE')                        // 161
  })

  it('SIKLUS 218: mutasi legacy /api/* wajib token UI (gerbang _api_token_ok)', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('def _api_token_ok(handler):')
    expect(s).toContain('return handler.command == "GET" or handler.headers.get("X-WFS-Token") == UI_TOKEN')
    // Gerbang terpasang TEPAT 2×: do_POST & do_DELETE (GET tetap terbuka).
    expect(s.match(/if not _api_token_ok\(self\):/g)?.length).toBe(2)
  })

  it('SIKLUS 222: CORS wildcard proxy admin dihapus + HEAD halaman HTML = status GET', () => {
    const s = readFileSync(SRC, 'utf-8')
    // (a) Tidak ada lagi Access-Control-Allow-Origin "*" di proxy /api/admin/*
    //     (semua konsumen same-origin :9503 — panel /admin/ diproxy; CORS
    //     backend :8000 sendiri sudah allow_origins ["*"]).
    expect(s.replace(/\n#.*/g, '')).not.toContain('"Access-Control-Allow-Origin"')
    // (b) HEAD /, /app/, /landing kini 200 via _serve_head_html — dulu 404
    //     (monitor uptime berbasis HEAD menerima "page down" palsu), padahal
    //     HEAD /index.html statis sudah 200 via allowlist.
    expect(s).toContain('def _serve_head_html(self, fname, inject=False):')
    for (const anchor of [
      'return self._serve_head_html("index.html", inject=True)',
      'return self._serve_head_html("landing.html")',
    ]) expect(s).toContain(anchor)
    // do_HEAD tetap kena allowlist utk jalur statis (kontrak 214 utuh).
    expect(s).toContain('if self._allowed_rel() is not None:\n            super().do_HEAD()')
  })

  it('apply script deploy terkontrol: backup + compile-check + smoke + auto-rollback', () => {
    const a = readFileSync(APPLY, 'utf-8')
    expect(a).toContain('server.py.bak-')
    expect(a).toContain('py_compile')
    expect(a).toContain('def smoke(')
    expect(a).toContain('_rollback_to(bak)')
    expect(a).toContain('systemctl', ) // restart terkontrol, bukan kill manual
    // smoke wajib mengetes jalur hardening yang DULU mati
    expect(a).toContain('"Content-Length": "abc"')
    expect(a).toContain('payload terlalu besar')
  })

  it('SOP anti-drift terdokumentasi di sumber (JANGAN edit live langsung)', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('JANGAN mengedit ~/wfs-hq/server.py langsung')
    expect(s).toContain('drift_gate.test.js akan FAIL')
  })
})
