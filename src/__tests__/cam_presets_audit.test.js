import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const AUDIT = resolve(REPO, 'scripts/audit_cam_presets.py')
const OS_SRC = resolve(REPO, 'src/scene/OfficeScene.js')
const OCCL_SRC = resolve(REPO, 'src/scene/parts/label_occlusion.js')

describe('audit preset kamera & oklusi label (siklus 257)', () => {
  it('scripts/audit_cam_presets.py ada & executable', () => {
    const st = statSync(AUDIT)
    expect(st.isFile()).toBe(true)
    expect((st.mode & 0o111) !== 0).toBe(true)
  })

  it('script mencakup 6 preset kamera lengkap', () => {
    const src = readFileSync(AUDIT, 'utf8')
    const presets = ['iso', 'front', 'top', 'l1', 'l2', 'l3']
    presets.forEach(p => {
      expect(src).toContain(`"${p}"`)
    })
    expect(src).toContain('window.__wfsSceneControls.setView')
    expect(src).toContain('res.get("agentsCount") == 26')
    expect(src).toContain('res.get("zonesCount") == 5')
    expect(src).toContain('window.__occlFade')
  })

  it('OfficeScene.js menyematkan drawnX/drawnY proyeksi nyata pada p.zone sebelum occlusionPass', () => {
    const src = readFileSync(OS_SRC, 'utf8')
    expect(src).toMatch(/if\s*\(p\.zone\)\s*\{\s*(\/\/[^\n]*\n\s*)*p\.drawnX\s*=\s*p\.x;\s*p\.drawnY\s*=\s*p\.y;\s*return;\s*\}/)
  })

  it('label_occlusion.js memproses pasangan bubble×zone (pass siklus 257)', () => {
    const src = readFileSync(OCCL_SRC, 'utf8')
    expect(src).toContain('Siklus 257: pasangan BUBBLE×ZONE')
    expect(src).toContain('const bb = pts.filter(p => p && p.bub);')
    expect(src).toContain('areaMin = Math.min(areaZ, areaB)')
  })
})
