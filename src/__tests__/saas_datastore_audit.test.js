import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'

// drift-gate siklus 220: hasil audit eksposur datastore saas-dibantuin
// (postgres db + redis) terkunci sebagai script yang bisa diulang & wajib lulus.
//
// Latar (audit 2026-11-02, item backlog 219e):
// - db & redis TIDAK mem-publish port ke host sama sekali
//   (NetworkSettings.Ports null, PortBindings kosong) — hanya reachable
//   dari dalam network docker `saas-dibantuin_default` (internal=false,
//   tapi tanpa published port berarti host/LAN/internet tak bisa masuk).
// - Compose source: db/redis tanpa blok `ports:`; backend tetap
//   "127.0.0.1:8000:8000" (loopback-only, siklus 163).
// - ss: 0 listener host :5432/:6379; TCP loopback ditolak.
// - redis hidup (redis-cli ping = PONG) & postgres hidup (pg_isready
//   accepting) — keduanya in-network saja.
// - INFO: redis requirepass kosong & postgres password dev — tidak masalah
//   selama network-isolated; menjadi gap bila port dipublish.
//
// Guard ini memastikan: (1) script audit ada & executable, (2) coverage
// ceknya tidak menyusut, (3) audit live benar-benar lulus saat test jalan.

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const AUDIT = resolve(REPO, 'scripts/audit_saas_datastore.py')
const execFileAsync = promisify(execFile)

describe('audit datastore saas-dibantuin (siklus 220)', () => {
  it('scripts/audit_saas_datastore.py ada & executable', () => {
    const st = statSync(AUDIT)
    expect(st.isFile()).toBe(true)
    // executable bit — audit harus bisa dipanggil langsung oleh cron/CI
    expect(st.mode & 0o111).not.toBe(0)
  })

  it('coverage audit tidak menyusut (ports null + bindings kosong + ss + TCP + hidup in-network)', () => {
    const s = readFileSync(AUDIT, 'utf-8')
    expect(s).toContain('5432/tcp') // Ports null postgres
    expect(s).toContain('6379/tcp') // Ports null redis
    expect(s).toContain('PortBindings') // HostConfig bindings kosong
    expect(s).toContain('127.0.0.1:8000:8000') // backend anchor loopback-only
    expect(s).toContain('ss') // 0 listener host
    expect(s).toContain('tcp_refused') // probe TCP loopback ditolak
    expect(s).toContain('redis-cli') // hidup in-network
    expect(s).toContain('pg_isready') // hidup in-network
    expect(s).toContain('requirepass') // INFO auth internal redis
  })

  it('audit live datastore lulus penuh (semua cek PASS)', async () => {
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
