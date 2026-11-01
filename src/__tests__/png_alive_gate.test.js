import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 194: gate PIKSEL scene-alive (kandidat "audit tooling" 193) — SOP
// lama "scene hidup = PNG > 500 KB" (dan gate byte e2e_err_probe 300 KB)
// hanya PROKSI: jebakan terukur "langit-saja" (gradien penuh, TANPA konten
// scene) = 378 KB — LOLOS gate byte, padahal scene mati. Statistik piksel
// (scripts/png_stats.py, decoder stdlib zlib/struct) mengadili ISI gambar:
// warna unik >= 1500 & fraksi non-background >= 4%. Kalibrasi (DEV_LOG 194):
// siang 11.439 / malam 12.215 / mobile 3.428-18.353 warna (ALIVE); gradien
// 616, kanvas polos 1 (DEAD). Sumber kebenaran = teks skrip (unit nyata
// butuh Xvfb :99 + chrome-headless-shell — di luar vitest; pola
// shot_mobile.test.js siklus 187).

const here = fileURLToPath(new URL('.', import.meta.url))
const pngStats = readFileSync(resolve(here, '../../scripts/png_stats.py'), 'utf-8')
const shotSrc = readFileSync(resolve(here, '../../scripts/shot.py'), 'utf-8')
const probeSrc = readFileSync(resolve(here, '../../scripts/e2e_err_probe.py'), 'utf-8')

describe('png_stats.py — decoder + ambang piksel terkalibrasi (siklus 194)', () => {
  it('ambang ALIVE: warna >= 1500 & nonbg >= 4% (terkalibrasi, bukan 150 lama)', () => {
    expect(pngStats).toContain('MIN_COLORS_ALIVE = 1500')
    expect(pngStats).toContain('MIN_NONBG_FRAC = 0.04')
  })

  it('jebakan kalibrasi terdokumentasi di sumber (guard anti turun ambang)', () => {
    // gradien 378 KB / 616 warna = lolos gate byte tapi DEAD piksel
    expect(pngStats).toContain('616 warna')
    expect(pngStats).toContain('378 KB')
  })

  it('decoder PNG: 5 filter scanline + tolak interlace/bukan-8bit (ValueError)', () => {
    for (const f of ['Sub', 'Up', 'Average', 'Paeth']) {
      expect(pngStats).toContain(`# ${f}`)
    }
    expect(pngStats).toContain('if depth != 8 or interlace != 0:')
    expect(pngStats).toContain('raise ValueError')
  })

  it('verdict dari ISI gambar: colors & nonbg_frac dihitung dari piksel sampling', () => {
    expect(pngStats).toContain('"colors": len(colors)')
    expect(pngStats).toContain('"nonbg_frac": round(nonbg / max(total, 1), 4)')
  })
})

describe('shot.py — verdict ALIVE/DEAD otomatis menggantikan cek manusia', () => {
  it('memuat png_stats.py by path (pola e2e_err_probe, bukan import generik)', () => {
    expect(shotSrc).toContain('spec_from_file_location')
    expect(shotSrc).toContain('"wfs_png_stats"')
    expect(shotSrc).toContain('png_stats.py')
  })

  it('keluaran mencetak ALIVE/DEAD + statistik px, exit 0 hanya jika alive', () => {
    expect(shotSrc).toContain("'ALIVE' if alive else 'DEAD'")
    expect(shotSrc).toContain('sys.exit(0 if (len(data) > 0 and alive) else 1)')
  })

  it('decode gagal = DEAD (scene tidak terbukti hidup), bukan crash tanpa pesan', () => {
    expect(shotSrc).toContain('except Exception as e:  # decode gagal = scene tidak terbukti hidup')
  })
})

describe('e2e_err_probe.py — gate #7 piksel ikut verdict akhir', () => {
  it('gate piksel dihitung via png_mod.png_stats + alive_verdict', () => {
    expect(probeSrc).toContain('png_mod.png_stats(data)')
    expect(probeSrc).toContain('png_mod.alive_verdict(px)')
    expect(probeSrc).toContain('res["pixels_ok"] = px_ok')
  })

  it('pixels_ok WAJIB bagian clean (verdict akhir OK/FAIL probe)', () => {
    expect(probeSrc).toContain('and res["pixels_ok"]')
  })

  it('decode gagal = DEAD eksplisit, probe tetap selesai (try/except, bukan raise)', () => {
    expect(probeSrc).toContain('except Exception as e:  # decode gagal = verdict DEAD (bukan crash probe)')
  })
})
