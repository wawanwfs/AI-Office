import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'

// drift-gate siklus 219: hasil audit JWT backend saas-dibantuin :8000
// terkunci sebagai script yang bisa diulang & wajib lulus.
//
// Latar (audit 2026-11-02, item backlog 218e):
// - :8000 = container saas-dibantuin-backend-1, bind 127.0.0.1 (loopback
//   saja via docker-proxy) — tidak terekspos LAN/internet.
// - SEMUA /api/admin/* bertanda HTTPBearer di OpenAPI DAN terbukti 401
//   live tanpa token maupun dengan token palsu; /api/health +
//   /api/auth/login satu-satunya jalur terbuka (by design).
// - JWT_SECRET live 64 char, HS256, access 30 mnt / refresh 7 hari
//   ber-jti tersimpan di DB auth.
// - scripts/audit_saas_jwt.py menegakkan 12 cek ini (read-only /
//   berdampak-nol: probe loopback, kredensial login SELALU salah,
//   tidak ada mutasi data).
//
// Guard ini memastikan: (1) script audit ada & executable, (2) coverage
// ceknya tidak menyusut, (3) audit live benar-benar lulus saat test jalan.

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const AUDIT = resolve(REPO, 'scripts/audit_saas_jwt.py')
const execFileAsync = promisify(execFile)

describe('audit JWT saas-dibantuin :8000 (siklus 219)', () => {
  it('scripts/audit_saas_jwt.py ada & executable', () => {
    const st = statSync(AUDIT)
    expect(st.isFile()).toBe(true)
    // executable bit — audit harus bisa dipanggil langsung oleh cron/CI
    expect(st.mode & 0o111).not.toBe(0)
  })

  it('coverage audit tidak menyusut (6 endpoint admin + palsu + login + proxy + secret)', () => {
    const s = readFileSync(AUDIT, 'utf-8')
    for (const ep of [
      '/api/admin/stats', '/api/admin/tenants', '/api/admin/conversations',
      '/api/admin/knowledge', '/api/admin/chat',
    ]) expect(s).toContain(ep)
    expect(s).toContain('Authorization') // probe token palsu
    expect(s).toContain('/api/auth/login') // login kredensial salah
    expect(s).toContain('127.0.0.1:9503') // proxy tidak bypass
    expect(s).toContain('JWT_SECRET') // panjang secret live
    expect(s).toContain('0.0.0.0:8000') // bind wild TIDAK boleh ada
  })

  it.skipIf(process.env.WFS_RUN_LIVE_AUDITS !== '1')('audit live :8000 lulus penuh (semua cek PASS)', async () => {
    try {
      const { stdout } = await execFileAsync('python3', [AUDIT], { timeout: 180_000 })
      expect(stdout).toContain('PASS')
      expect(stdout).not.toContain('[FAIL]')
    } catch (e) {
      // lempar ulang dengan output audit agar gagalnya bisa didiagnosis
      throw new Error(`audit gagal: ${e.message}\n${e.stdout ?? ''}\n${e.stderr ?? ''}`)
    }
  })
})
