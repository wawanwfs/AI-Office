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
    // do_HEAD tetap kena gerbang allowlist utk jalur statis (kontrak 214 utuh).
    // Siklus 455: file allowlist tak ada → 404 JSON; super().do_HEAD() stdlib
    // dihapus (metadata file hilang tak tersaji + konsisten dgn do_GET 455).
    expect(s).toContain('if self._allowed_rel() is not None:\n            return _reply_404(self, head=True)')
  })

  it('SIKLUS 223: HEAD aset statis = metadata GET (cache policy + gzip), bukan stdlib no-store/raw CL', () => {
    const s = readFileSync(SRC, 'utf-8')
    // helper _serve_head_static ada & dipasang di do_HEAD sebelum fallback stdlib.
    expect(s).toContain('def _serve_head_static(self):')
    expect(s).toContain('if self._serve_head_static():')
    // cache policy + kompresi konsisten GET (bukan no-store + CL mentah stdlib).
    expect(s).toContain('static_serve.maybe_gzip(')
    expect(s.match(/_serve_head_static/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('SIKLUS 224: HEAD jalur proxy (/admin/, /cs-widget/, /api/admin/*) mirror GET, terpasang sebelum fallback stdlib', () => {
    const s = readFileSync(SRC, 'utf-8')
    for (const fn of ['_serve_head_admin_api', '_serve_head_admin', '_serve_head_cs_widget', '_head_proxy_helper']) {
      expect(s).toContain(`def ${fn}(`)
    }
    const head = s.slice(s.indexOf('def do_HEAD('))
    // ketiga cabang proxy HEAD dipasang SEBELUM fallback stdlib/404.
    for (const fn of ['_serve_head_admin_api', '_serve_head_admin', '_serve_head_cs_widget']) {
      expect(head.indexOf(`self.${fn}()`)).toBeGreaterThan(-1)
      expect(head.indexOf(`self.${fn}()`)).toBeLessThan(head.indexOf('self._allowed_rel() is not None'))
    }
    // HEAD→GET rewrite loopback (upstream :8000 menjawab 405 untuk HEAD).
    // Siklus 460: empat cabang mendelegasi ke SATU titik _head_proxy_helper.
    expect(s).toContain('def _head_proxy_helper(self, port, path, timeout=30,')
    expect(s).toContain('conn.request("GET", path, headers=fwd_headers or {})')
  })

  it('SIKLUS 225: HEAD sisa jalur proxy (/api/*, /preview/*, /wfs-api/*, /wfs-project) mirror GET via replay; SSE dikecualikan', () => {
    const s = readFileSync(SRC, 'utf-8')
    // helper replay ada: penelan body + intersep status/header.
    expect(s).toContain('class _HeadCaptureWriter')
    expect(s).toContain('class _head_body_sink')
    for (const fn of ['_serve_head_api_service', '_serve_head_gateway', '_serve_head_project']) {
      expect(s).toContain(`def ${fn}(`)
    }
    // replay memanggil cabang GET asli (bukan duplikasi logika).
    expect(s).toContain('api_service.handle_api_request(self, "GET", self.path)')
    expect(s).toContain('project_api.handle_project(self)')
    // HEAD→GET rewrite loopback untuk gateway — kini via _head_proxy_helper
    // (satu titik, siklus 460); tidak ada lagi HTTPConnection duplikat di sini.
    expect(s).toContain('self._head_proxy_helper(8787, "/api/" + sub, timeout=120,')
    // SSE streaming dikecualikan dari replay (GET tak berujung → kontrak 404).
    expect(s).toContain('if p == "/api/events":')
    expect(s).toContain('if self.path.split("?")[0] == "/wfs-api/events":')
    // ketiga cabang baru dipasang di do_HEAD SEBELUM fallback stdlib/404.
    const head = s.slice(s.indexOf('def do_HEAD('))
    for (const fn of ['_serve_head_api_service', '_serve_head_gateway', '_serve_head_project']) {
      expect(head.indexOf(`self.${fn}()`)).toBeGreaterThan(-1)
      expect(head.indexOf(`self.${fn}()`)).toBeLessThan(head.indexOf('self._allowed_rel() is not None'))
    }
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

  it('SIKLUS 228: disconnect klien senyap — ClientGone + helper tulis + jaring handle_error', () => {
    const s = readFileSync(SRC, 'utf-8')
    // Penanda disconnect eksplisit + helper tulis aman + jaring server ada.
    expect(s).toContain('class ClientGone(Exception):')
    expect(s).toContain('def _wfs_write_or_client_gone(handler, data):')
    expect(s).toContain('def _hq_handle_error(request, client_address, exc_info=None):')
    expect(s).toContain('s.handle_error = _hq_handle_error')
    // Anti-pola DILARANG kembali: fallback 502 menulis langsung ke wfile
    // (rantai "During handling" jurnald 228) — _reply_json wajib via helper.
    expect(s).not.toMatch(/_reply_json\(self, 502[\s\S]{0,400}?self\.wfile\.write/)
    // exc_info opsional: sys.exc_info() mati di luar blok except (3.11+) —
    // benteng wajib bisa diuji unit tanpa server sungguhan.
    expect(s).toContain('info = exc_info or sys.exc_info()')
  })
})
