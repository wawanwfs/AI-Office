import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Siklus 262 — drift-gate parser otomatis klaim vision (scripts/audit_vision_claims.py)
// + census guard (subprocess/http) + sinkronisasi scripts/vision_claims.json.
//
// Latar (pelajaran 256/258): temuan vision_analyze ("label bertumpuk") tidak boleh
// dipercaya mentah — dua siklus terbukti menghabiskan probe untuk pasangan yang
// SEDANG DIKONVERGENSI sistem oklusi (bukan bug). Siklus 262 memagari alur:
//   parser DEV_LOG → pasangan klaim (JSON) → audit live CDP dgn oracle oklusi Python
//   (hitung ulang aturan agent×zone/bubble×zone/TIE vs occ yang ditulis pass).
// Guard di sini menjaga kontrak parser + oracle TANPA browser (vitest harus
// deterministik): census python, konstanta mirror label_occlusion.js, oracle
// dijalankan inline pada fixture kecil, dan sinkronisasi JSON diverifikasi.

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const SCRIPT = resolve(root, 'scripts/audit_vision_claims.py')
const CLAIMS = resolve(root, 'scripts/vision_claims.json')
const read = (p) => readFileSync(p, 'utf8')

describe('audit_vision_claims siklus 262 — drift-gate parser & oracle', () => {
  const src = read(SCRIPT)

  it('script ada & executable', () => {
    expect(src).toBeTruthy()
    expect(src).toContain('#!/usr/bin/env python3')
  })

  it('konstanta oracle MIRROR eksak label_occlusion.js (satu sumber kebenaran)', () => {
    const occ = read(resolve(root, 'src/scene/parts/label_occlusion.js'))
    // nilai dari JS di-parse, bukan dicopy mentah — regenerasi konstanta JS otomatis terdeteksi
    const grab = (name) => {
      const m = occ.match(new RegExp(`export const ${name}\\s*=\\s*([0-9.]+)`))
      expect(m, `konstanta ${name} hilang dari label_occlusion.js`).toBeTruthy()
      return Number(m[1])
    }
    const px = grab('OCCL_PX'), zfrac = grab('OCCL_ZONE_TIE_FRAC'),
      tieFrac = grab('OCCL_TIE_FRAC'), zmin = grab('OCCL_ZONE_TIE_MIN')
    expect(src).toContain(`OCCL_PX = ${px}`)
    expect(src).toContain(`OCCL_ZONE_TIE_FRAC = ${zfrac}`)
    expect(src).toContain(`OCCL_TIE_FRAC = ${tieFrac}`)
    expect(src).toContain(`OCCL_ZONE_TIE_MIN = ${zmin}`)
  })

  it('nama agen/zona SATU SUMBER dari spec scene (bukan daftar salinan di script)', () => {
    for (const f of ['agents_spec.js', 'extended_desks.js', 'floor_zones.js']) {
      expect(src).toContain(`"${f}"`)
    }
    // REGRESI DILARANG: daftar agen/zona hardcode di script (menyusut diam saat
    // agen baru ditambahkan ke scene)
    expect(src).not.toMatch(/ZONE_LABELS\s*=\s*\[/)
    expect(src).not.toMatch(/AGENT_NAMES\s*=\s*\[/)
  })

  it('oracle zona + TIE dihitung ulang dgn fraksi & pad yang sama dgn pass JS', () => {
    // struktur oracle: ix*iy dibanding fraksi luas, pad OCCL_PX, zone min 0.5
    expect(src).toMatch(/ix\s*\*\s*iy\s*>=\s*area_z\s*\*\s*OCCL_ZONE_TIE_FRAC/)
    expect(src).toMatch(/ix\s*\*\s*iy\s*>=\s*amin\s*\*\s*frac/)
    expect(src).toContain('min(area_z, area_b)') // bubble×zone pakai luas terkecil
    expect(src).toMatch(/occ\s*=\s*min\(occ,\s*OCCL_ZONE_TIE_MIN\)/)
  })

  it('verdict klaim lengkap: RESOLVED/FALSIFIED/FADED-BY-OTHER/AGENT_MISSING/BUG', () => {
    for (const v of ['RESOLVED', 'FALSIFIED', 'FADED-BY-OTHER', 'AGENT_MISSING', ': BUG']) {
      expect(src).toContain(v)
    }
    // BUG = satu-satunya verdict yang gagalkan audit (exit 1)
    expect(src).toMatch(/return 1 if \(bugs or incomplete\) else 0/)
  })

  it('parser melewati polusi matematika & pola cross-noise dilarang', () => {
    expect(src).toContain('3.7125') // baris komentar alasan filter digit
    // pair regex menuntut konteks terukur (frac/ops/zop) — bukan teks bebas
    expect(src).toMatch(/LINE_FILTER_RE\s*=\s*re\.compile\(r"frac/)
  })
})

describe('audit_vision_claims siklus 262 — parse-only CLI (fixture inline)', async () => {
  // fixture sementara via tmp dir — /dev/stdin tidak bisa dibuka oleh python3
  // saat di-spawn dgn execFileSync (Errno 6), jadi tulis file nyata.
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'vc262-'))
  const FIX = (txt) => {
    const p = join(dir, 'dl.md')
    writeFileSync(p, txt)
    return p
  }
  const parse = (out) => JSON.parse(out).claims

  it('DEV_LOG nyata: ≥10 klaim unik, id eksak siklus, zona/agen pair tepat sumber', () => {
    const out = execFileSync('python3', [SCRIPT, '--parse-only', '--devlog', resolve(root, 'DEV_LOG.md')], { encoding: 'utf8', timeout: 30_000 })
    const claims = parse(out)
    expect(claims.length).toBeGreaterThanOrEqual(10)
    const ids = claims.map((c) => c.id)
    expect(new Set(ids).size).toBe(claims.length) // id unik
    expect(ids).toContain('VC-256-1') // RIAN×MEETING
    expect(ids).toContain('VC-251-2') // BANTUIN AI×BUDI
    expect(ids).toContain('VC-258-1') // Budi×CAFÉ (alias Kantin AI)
    const rian = claims.find((c) => c.id === 'VC-256-1')
    expect(rian.agent).toBe('RIAN')
    expect(rian.zone).toBe('MEETING')
    const budi = claims.find((c) => c.id === 'VC-258-1')
    expect(budi.zone).toBe('CAFÉ')
  })

  it('polusi matematika "3.7125×0.05" TIDAK menjadi klaim', () => {
    const out = execFileSync('python3', [SCRIPT, '--parse-only', '--devlog',
      FIX(`## 2026-01-01 vision probe\n- rasio == e^-3.7125×0.05 dan 0.94/frame = 2.4× lambat, frac none\n`)], { encoding: 'utf8', timeout: 30_000 })
    expect(parse(out)).toEqual([])
  })

  it('sumber lain (bukan DEV_LOG): pasangan vision polos tetap ter-parse', () => {
    const out = execFileSync('python3', [SCRIPT, '--parse-only', '--devlog',
      FIX(`## audit vision eksternal\n- klaim pasangan oklusi: Budi×Kantin AI, Sari×Support "menimpa teks zona".\n`)], { encoding: 'utf8', timeout: 30_000 })
    const claims = parse(out)
    expect(claims.map((c) => `${c.agent}×${c.pair_label}`).sort()).toEqual(['BUDI×CAFÉ', 'SARI×SUPPORT'])
    expect(claims[0].zone ?? claims[1].zone).toBe('CAFÉ')
  })

  it('vision_claims.json tersinkron == parse ulang DEV_LOG saat ini (drift nol)', () => {
    const saved = JSON.parse(read(CLAIMS))
    const out = execFileSync('python3', [SCRIPT, '--parse-only', '--devlog', resolve(root, 'DEV_LOG.md')], { encoding: 'utf8', timeout: 30_000 })
    expect(saved.claims).toEqual(parse(out))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
})

// ── Census guard (pola siklus 202/201): script baru Wajib pagari transportnya ──
function pyFiles() {
  const dir = resolve(root, 'scripts')
  return readdirSync(dir).filter((f) => f.endsWith('.py')).sort()
}
function stripComments(src) {
  return src.split('\n').map((l) => (l.trimStart().startsWith('#') ? '' : l)).join('\n')
}
function runSites(src) {
  const code = stripComments(src)
  const out = []
  const re = /subprocess\.(?:run|call|check_call|check_output)\s*\(/g
  let m
  while ((m = re.exec(code))) out.push(m.index)
  return out
}
function httpSites(src) {
  const code = stripComments(src)
  const out = []
  const re = /urllib\.request\.urlopen\s*\(/g
  let m
  while ((m = re.exec(code))) out.push(m.index)
  return out
}

describe('audit_vision_claims siklus 262 — census transport', () => {
  const all = pyFiles()
  const srcMap = Object.fromEntries(all.map((f) => [f, read(resolve(root, 'scripts', f))]))
  const runFiles = all.filter((f) => runSites(srcMap[f]).length > 0)
  const httpFiles = all.filter((f) => httpSites(srcMap[f]).length > 0)

  it('census: script baru terhitung di kedua census (subprocess & urlopen)', () => {
    expect(runFiles).toContain('audit_vision_claims.py')
    expect(httpFiles).toContain('audit_vision_claims.py')
    expect(all.length).toBeGreaterThanOrEqual(73) // 72 (261) + 1
  })

  it('setiap subprocess.run census punya timeout= (audit_vision_claims included)', () => {
    for (const f of runFiles) {
      const code = stripComments(srcMap[f])
      const re = /subprocess\.(?:run|call|check_call|check_output)\s*\(/g
      let m
      while ((m = re.exec(code))) {
        let i = m.index + m[0].length - 1
        let depth = 0
        let j = i
        let chunk = ''
        while (j < code.length && (depth > 0 || j === i) && j - i < 800) {
          chunk += code[j]
          if (code[j] === '(') depth++
          else if (code[j] === ')') {
            depth--
            if (depth === 0) break
          }
          j++
        }
        expect(chunk).toMatch(/timeout\s*[=:]/)
      }
    }
  })

  it('setiap urlopen census punya timeout= (audit_vision_claims included)', () => {
    for (const f of httpFiles) {
      const code = stripComments(srcMap[f])
      const re = /urllib\.request\.urlopen\s*\(/g
      let m
      while ((m = re.exec(code))) {
        let i = m.index + m[0].length - 1
        let depth = 0
        let j = i
        let chunk = ''
        while (j < code.length && (depth > 0 || j === i) && j - i < 800) {
          chunk += code[j]
          if (code[j] === '(') depth++
          else if (code[j] === ')') {
            depth--
            if (depth === 0) break
          }
          j++
        }
        expect(chunk).toMatch(/timeout\s*[=:]/)
      }
    }
  })
})
