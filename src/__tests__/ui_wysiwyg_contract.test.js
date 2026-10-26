// @vitest-environment node
// Kontrak anti-regresi WYSIWYG warna permukaan UI 3D (siklus 111):
// SEMUA situs tekstur kanvas "layar/teks" WAJIB dibungkus uiTexture(...) dan material
// unlit-nya uiMaterial(...) — bila situs baru ditambahkan tanpa helper, test ini fail.
// Tekstur dekoratif (terrazzo, langit, dinding, AO strip, sheen) sengaja dikecualikan.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(path.join(here, '..', p), 'utf8')

// Situs UI wajib-wrap: [file, polaCanvasTexture, polaMaterial (opsional utk Mesh/Sprite)]
const UI_SITES = [
  ['scene/parts/lounge.js', /const tvTex = uiTexture\(new THREE\.CanvasTexture\(tvC\)\)/],
  ['scene/parts/projectboard.js', /const tex = uiTexture\(new THREE\.CanvasTexture\(cv\)\)/],
  ['scene/parts/room.js', /map: uiTexture\(new THREE\.CanvasTexture\(cv\)\)/], // whiteboard
  ['scene/parts/room.js', /const tex = uiTexture\(new THREE\.CanvasTexture\(cv\)\); tex\.minFilter/], // jam dinding
  ['scene/OfficeScene.js', /const tex=uiTexture\(new THREE\.CanvasTexture\(lc\)\)/], // label agen (full/short)
  ['scene/OfficeScene.js', /const stx=uiTexture\(new THREE\.CanvasTexture\(sc\)\)/], // monitor agen
  ['scene/OfficeScene.js', /const tex = uiTexture\(new THREE\.CanvasTexture\(c\)\); tex\.minFilter/], // nameplate
  ['scene/OfficeScene.js', /const wtt=uiTexture\(new THREE\.CanvasTexture\(wtc\)\)/], // judul dinding
  ['scene/OfficeScene.js', /const btex=uiTexture\(new THREE\.CanvasTexture\(bc\)\)/], // bubble chat
  ['scene/parts/furniture.js', /map: uiTexture\(new THREE\.CanvasTexture\(cv\)\)/], // poster dinding
  ['scene/parts/decor.js', /map: uiTexture\(new THREE\.CanvasTexture\(pc\)\)/], // poster motivasi
  ['scene/parts/cafe.js', /map: uiTexture\(new THREE\.CanvasTexture\(mbc\)\)/], // menu board
  ['scene/parts/reception.js', /uiTexture\(t\); return t/], // logo resepsionis
  ['scene/parts/walls.js', /lt\.anisotropy=4;uiTexture\(lt\)/], // logo dinding
  ['scene/parts/walls.js', /map:uiTexture\(new THREE\.CanvasTexture\(nc\)\)/], // papan sambutan
  ['scene/parts/flooring.js', /const zt=uiTexture\(new THREE\.CanvasTexture\(zc\)\)/], // label zona
  ['scene/parts/terraces.js', /const tex = uiTexture\(new THREE\.CanvasTexture\(cv\)\)/], // sign lantai
]

// Material layar wajib toneMapped=false (unlit screen/teks — tak kena ACES)
const UI_MATS = [
  ['scene/parts/lounge.js', /const tvScr = uiMaterial\(/],
  ['scene/parts/projectboard.js', /const mesh = uiMaterial\(/],
  ['scene/parts/room.js', /const board = uiMaterial\(/],
  ['scene/parts/room.js', /const face = uiMaterial\(/],
  ['scene/OfficeScene.js', /const screen=uiMaterial\(/],
  ['scene/OfficeScene.js', /const plate = uiMaterial\(/],
  ['scene/OfficeScene.js', /const wallTitle=uiMaterial\(/],
  ['scene/OfficeScene.js', /new THREE\.Sprite\(uiMaterial\(new THREE\.SpriteMaterial\(\{\s*map: short\.tex/],
  ['scene/OfficeScene.js', /new THREE\.Sprite\(uiMaterial\(new THREE\.SpriteMaterial\(\{map:btex/],
  ['scene/parts/furniture.js', /const plane = uiMaterial\(/],
  ['scene/parts/decor.js', /const pm = uiMaterial\(/],
  ['scene/parts/cafe.js', /const mb = uiMaterial\(/],
  ['scene/parts/reception.js', /const rcLogoMesh = uiMaterial\(/],
  ['scene/parts/walls.js', /const logo=uiMaterial\(/],
  ['scene/parts/walls.js', /const sign=uiMaterial\(/],
  ['scene/parts/flooring.js', /new THREE\.Sprite\(uiMaterial\(new THREE\.SpriteMaterial\(\{map:zt/],
  ['scene/parts/terraces.js', /const m = uiMaterial\(/],
]

describe('kontrak WYSIWYG warna UI 3D (uiTexture + uiMaterial)', () => {
  it.each(UI_SITES)('%s: situs tekstur UI dibungkus uiTexture', (file, re) => {
    expect(read(file)).toMatch(re)
  })

  it.each(UI_MATS)('%s: material layar dibungkus uiMaterial (toneMapped=false)', (file, re) => {
    expect(read(file)).toMatch(re)
  })

  it('helper ui_colorspace menandai srgb & toneMapped=false', async () => {
    const { uiTexture, uiMaterial, SRGB } = await import('../scene/parts/ui_colorspace.js')
    expect(SRGB).toBe('srgb')
    const tex = {}; const mat = {}
    expect(uiTexture(tex).colorSpace).toBe('srgb')
    expect(uiMaterial(mat).toneMapped).toBe(false)
  })

  it('tidak ada CanvasTexture layar yang lolos tanpa uiTexture di parts UI inti', () => {
    // Negatif: di file-file ini, SETIAP new THREE.CanvasTexture harus berada di dalam
    // uiTexture( ... ) — cek kasar: jumlah `new THREE.CanvasTexture` === jumlah `uiTexture(`
    const files = [
      'scene/parts/lounge.js', 'scene/parts/projectboard.js',
      'scene/parts/furniture.js', 'scene/parts/decor.js', 'scene/parts/cafe.js',
    ]
    for (const f of files) {
      const src = read(f)
      const create = (src.match(/new THREE\.CanvasTexture/g) || []).length
      const wrapped = (src.match(/uiTexture\(\s*new THREE\.CanvasTexture|uiTexture\(t\)/g) || []).length
      expect(create, `${f}: semua CanvasTexture harus dibungkus uiTexture`).toBe(wrapped)
    }
  })
})
