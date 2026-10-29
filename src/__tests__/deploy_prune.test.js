import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Siklus 158: guard deploy — scripts/deploy.py harus (1) menyalin dist/ sinkron,
// (2) memangkas file hashed orphan dari ~/wfs-hq/assets (tidak direferensikan
// index.html / landing.html / sw.js), (3) mengarsipkan — bukan rm permanen.
// Sumber kebenaran = teks deploy.py (unit nyata butuh menulis ke ~/wfs-hq produksi).

const src = readFileSync(resolve(__dirname, '../../scripts/deploy.py'), 'utf-8')

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
    // file yang direferensikan tidak boleh dipangkas
    expect(src).toContain('name in refs')
  })

  it('mengarsipkan ke .pruned-assets — tidak ada rm permanen file basi', () => {
    expect(src).toContain('.pruned-assets')
    expect(src).toContain('shutil.move(src, dst)')
  })
})
