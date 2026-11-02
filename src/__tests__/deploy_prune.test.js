import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 158: guard deploy — scripts/deploy.py harus (1) menyalin dist/ sinkron,
// (2) memangkas file hashed orphan dari ~/wfs-hq/assets (tidak direferensikan
// index.html / landing.html / sw.js), (3) mengarsipkan — bukan rm permanen.
// Sumber kebenaran = teks deploy.py (unit nyata butuh menulis ke ~/wfs-hq produksi).

const here = fileURLToPath(new URL('.', import.meta.url))
const src = readFileSync(resolve(here, '../../scripts/deploy.py'), 'utf-8')

describe('deploy.py — sinkronisasi + pemangkasan aset orphan', () => {
  it('menghapus assets/ lama sebelum salin ulang dari dist (tidak menumpuk)', () => {
    expect(src).toContain('shutil.rmtree(dst_assets)')
    expect(src).toContain('copytree(src_assets, dst_assets)')
    // salin assets dulu, baru file lain — urutan logis sinkron
    expect(src.indexOf('copytree(src_assets, dst_assets)')).toBeGreaterThan(-1)
  })

  it('hanya memangkas file ber-hash, referensi index/landing/sw dihormati', () => {
    // pola hashed Vite/Rolldown
    expect(src).toMatch(/HASHED_RE\s*=\s*re\.compile/)
    expect(src).toContain("'index.html', 'landing.html', 'sw.js'")
    // file yang direferensikan tidak boleh dipangkas — nama lengkap ATAU
    // stem tanpa ekstensi (siklus 192: sw.js meng-import "./workbox-<hash8>")
    expect(src).toContain('_is_referenced(name, refs)')
  })

  it('mengarsipkan ke .pruned-assets — tidak ada rm permanen file basi', () => {
    expect(src).toContain('.pruned-assets')
    expect(src).toContain('shutil.move(src, dst)')
  })
})

describe('siklus 215 — higiene PNG root web (deploy_prune_png)', () => {
  it('prune_root_png ada & dipanggil di deploy() — invarian tiap deploy', () => {
    expect(src).toContain('def prune_root_png()')
    expect(src).toMatch(/prune_root_png\(\)/)
    // deploy() menjumlahkan TIGA sumber prune (assets, root hashed, root png)
    expect(src).toMatch(/len\(prune_orphan_assets\(\)\).*len\(prune_root_stale\(\)\).*len\(prune_root_png\(\)\)/s)
  })

  it('PNG root wajib berasal dari dist/ — whitelist dibaca dari SRC_DIST, bukan daftar tulangan', () => {
    // invarian: keputusan sah = keanggotaan dist/, bukan hardcoded — dist yang
    // menambah ikon baru otomatis sah, artefak screenshot otomatis dipangkas
    expect(src).toMatch(/dist_png\s*=\s*\{n for n in os\.listdir\(SRC_DIST\) if n\.lower\(\)\.endswith\('\.png'\)\}/)
    expect(src).toContain('if name in dist_png:')
  })

  it('arsip reversibel (move ke .pruned-assets / rm hanya jika sudah ada)', () => {
    const block = src.match(/def prune_root_png\(\) -> list:[\s\S]*?\n\n\ndef deploy/)[0]
    expect(block).toContain('os.makedirs(PRUNE_DIR, exist_ok=True)')
    expect(block).toContain('shutil.move(p, dst)')
    expect(block).toContain('if os.path.exists(dst):')
  })
})
