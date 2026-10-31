import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 191: gate HYGIENE deploy di probe wajib — bug siklus 157 sempat
// MENGULANG: SOP cron masih `cp -r dist/* ~/wfs-hq/` (tak menghapus bundle
// hashed lama) sehingga assets/ kembali menumpuk 75 file vs 11 hidup (11 MB
// basi ter-serve publik). Kini e2e_err_probe.py (dijalankan TIAP siklus)
// memuat scripts/deploy.py sebagai satu sumber (HASHED_RE + referenced_assets)
// dan FAIL bila assets/ menumpuk file hashed orphan (>15 file / ada orphan).
// Sumber kebenaran = teks kedua skrip (unit nyata butuh menulis ~/wfs-hq produksi).

const here = fileURLToPath(new URL('.', import.meta.url))
const probe = readFileSync(resolve(here, '../../scripts/e2e_err_probe.py'), 'utf-8')
const deployPy = readFileSync(resolve(here, '../../scripts/deploy.py'), 'utf-8')

describe('e2e_err_probe.py — gate hygiene anti re-akumulasi assets/', () => {
  it('memuat deploy.py by path sebagai satu sumber (bukan import ambigu)', () => {
    expect(probe).toContain('spec_from_file_location')
    expect(probe).toContain('"wfs_deploy"')
    expect(probe).toContain('deploy.py')
    // regresi: import generik "import deploy" ambigu di search path — dilarang
    expect(probe).not.toMatch(/^import deploy\b/m)
  })

  it('gate menghitung orphan dari referensi nyata dan FAIL bila menumpuk', () => {
    expect(probe).toContain('deploy_mod.referenced_assets()')
    expect(probe).toContain('deploy_mod.HASHED_RE.match(n)')
    // orphan = hashed yang tidak direferensikan index/landing/sw — cek via
    // _is_referenced (nama lengkap ATAU stem; siklus 192: sw.js meng-import
    // workbox sebagai sibling tanpa ekstensi)
    expect(probe).toContain('deploy_mod._is_referenced(n, refs)')
    // ambang akumulasi: >15 file hashed = FAIL (build sehat = 11)
    expect(probe).toContain('15')
    expect(probe).toContain('hygiene_ok')
    // gate ikut menentukan verdict akhir probe
    expect(probe).toContain('clean = clean and res["hygiene_ok"]')
  })

  it('deploy.py import-safe (logika dalam fungsi + guard __main__)', () => {
    // tanpa guard, import probe memicu salin-produksi efek samping
    expect(deployPy).toContain("if __name__ == '__main__':")
    expect(deployPy).toContain('def deploy():')
    expect(deployPy).toContain('def sync_dist_to_hq():')
    expect(deployPy).toContain('def prune_orphan_assets()')
    expect(deployPy).toContain('def referenced_assets()')
  })

  it('deploy.py tetap sinkron penuh (guard siklus 158 tidak ter regression)', () => {
    expect(deployPy).toContain('shutil.rmtree(dst_assets)')
    expect(deployPy).toContain('copytree(src_assets, dst_assets)')
    expect(deployPy).toContain('.pruned-assets')
    expect(deployPy).toContain('shutil.move(src, dst)')
  })
})
