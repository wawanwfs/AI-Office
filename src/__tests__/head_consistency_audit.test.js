import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'

// drift-gate siklus 226: konsistensi HEAD == GET di SEMUA front HTTP loopback.
//
// Latar (audit live 2026-11-02):
// - Siklus 222/223/224/225 menutup :9503 (wfs_hq_server.py) — HTML, aset
//   statis, /admin/, /cs-widget/, /api/admin/*, /api/*, /preview/*,
//   /wfs-api/*, /wfs-project semuanya mirror GET.
// - :3000 (admin Next.js) & :3001 (widget) sudah konsisten native
//   (HEAD 200 CL 13283 / 13803 == GET) — diverifikasi, tidak diubah.
// - :8000 (backend saas-dibantuin, FastAPI) TIDAK konsisten: GET
//   /api/health = 200 json 51 B tapi HEAD = 405 Method Not Allowed
//   (FastAPI APIRoute tidak mendaftarkan HEAD; hanya rute bawaan
//   Starlette seperti /docs & /openapi.json yang konsisten). Monitor
//   berbasis HEAD menerima "service down" palsu.
// - Perbaikan di sisi app: backend/app/http_head_mirror.py —
//   HeadMirrorMiddleware me-REPLAY HEAD menjadi GET lewat app asli,
//   menelan body, lalu memancarkan status+header GET dgn
//   Content-Length = panjang body GET eksak dan body kosong. Path tanpa
//   rute GET tetap 405/404 asli; rute ber-HEAD native dihormati.
//
// Guard ini memastikan: (1) script audit ada & executable, (2) cakupan
// ceknya tidak menyusut (siklus 227: front ke-5 = gateway :8787 — defek
// FastAPI yang sama ditemukan di sana & diperbaiki via HeadMirrorMiddleware
// di superset wfs_server.py), (3) middleware mirror tetap memakai pola replay
// (bukan duplikasi logika), (4) audit live benar-benar lulus.

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const AUDIT = resolve(REPO, 'scripts/audit_head_consistency.py')
const MIRROR = resolve(REPO, '../wfs-office/saas-dibantuin/backend/app/http_head_mirror.py')
const execFileAsync = promisify(execFile)

describe('audit konsistensi HEAD vs GET (siklus 226)', () => {
  it('scripts/audit_head_consistency.py ada & executable', () => {
    const st = statSync(AUDIT)
    expect(st.isFile()).toBe(true)
    expect(st.mode & 0o111).not.toBe(0)
  })

  it('cakupan audit tidak menyusut (5 front + kontrak allowlist + rute auth-only)', () => {
    const s = readFileSync(AUDIT, 'utf-8')
    for (const port of ['127.0.0.1:9503', '127.0.0.1:8000', '127.0.0.1:3000', '127.0.0.1:3001', '127.0.0.1:8787']) {
      expect(s).toContain(port)
    }
    // kontrak lama yang TIDAK boleh berubah
    expect(s).toContain('/server.py') // allowlist :9503 tetap 404
    // rute inti tiap front
    expect(s).toContain('/api/health')
    expect(s).toContain('/api/admin/stats')
    expect(s).toContain('/wfs-api/tasks')
    expect(s).toContain('/wfs-project')
    expect(s).toContain('/admin/')
    // gateway :8787 (siklus 227): rute inti + path asing
    expect(s).toContain('/api/tasks/paused')
    expect(s).toContain('/api/agents')
    expect(s).toContain('/api/orders')
    expect(s).toContain('/api/dashboard/stats')
    // SSE dikecualikan eksplisit (GET streaming tanpa ujung)
    expect(s).toContain('/api/events')
    expect(s).toContain('/wfs-api/events')
    expect(s).toContain('SKIP_PREFIX')
    // body HEAD wajib kosong + CL wajib sama
    expect(s).toContain('ok_nobody')
    expect(s).toContain('ok_cl')
  })

  it.skipIf(process.env.WFS_RUN_LIVE_AUDITS !== '1')('middleware HEAD mirror memakai pola replay, bukan duplikasi respons', () => {
    const s = readFileSync(MIRROR, 'utf-8')
    // replay: scope diberi method GET lalu app asli dijalankan
    expect(s).toContain('get_scope["method"] = "GET"')
    expect(s).toContain('await self.app(get_scope, replay_receive, capture)')
    // Content-Length dari panjang body GET, body HEAD kosong
    expect(s).toContain('b"content-length"')
    expect(s).toContain('"body": b""')
    // anti-deadlock: receive asli TIDAK di-drain (transport mem-block)
    expect(s).toContain('receive asli TIDAK di-drain')
    expect(s).not.toMatch(/while True:\s*\n\s*msg = await receive\(\)/)
    // rute tanpa GET tetap dijawab router apa adanya (405/404 asli)
    expect(s).toContain('_has_get_route')
    expect(s).toContain('_has_native_head_route')
    // terpasang di app
    const main = readFileSync(MIRROR.replace('http_head_mirror.py', 'main.py'), 'utf-8')
    expect(main).toContain('app.add_middleware(HeadMirrorMiddleware)')
  })

  it.skipIf(process.env.WFS_RUN_LIVE_AUDITS !== '1')('audit live lulus penuh (semua front HEAD == GET)', async () => {
    try {
      const { stdout } = await execFileAsync('python3', [AUDIT], { timeout: 180_000 })
      expect(stdout).toContain('PASS')
      expect(stdout).not.toContain('[FAIL]')
      expect(stdout).not.toContain('CONN-FAIL')
      // jumlah PASS tidak boleh menyusut (23 target saat siklus 227: 15 + 8 gateway :8787)
      expect(stdout).toContain('23/23 PASS')
    } catch (e) {
      throw new Error(`audit gagal: ${e.message}\n${e.stdout ?? ''}\n${e.stderr ?? ''}`)
    }
  })
})
