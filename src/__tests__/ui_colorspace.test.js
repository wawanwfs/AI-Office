// @vitest-environment node
// Unit test ui_colorspace.js — WYSIWYG warna permukaan UI 3D (siklus 111).
// uiTexture: tandai colorSpace 'srgb'; uiMaterial: toneMapped=false. Keduanya
// chainable & aman terhadap objek stub (tanpa properti) dan null/undefined.
import { describe, it, expect } from 'vitest'
import { uiTexture, uiMaterial, SRGB } from '../scene/parts/ui_colorspace.js'

describe('uiTexture', () => {
  it('menandai colorSpace srgb pada tekstur dan mengembalikan objek yang sama (chainable)', () => {
    const tex = { colorSpace: null, minFilter: 'x' }
    const out = uiTexture(tex)
    expect(out).toBe(tex)
    expect(out.colorSpace).toBe(SRGB)
    expect(SRGB).toBe('srgb') // konstanta string three r152+ THREE.SRGBColorSpace
  })

  it('mempertahankan properti lain & menimpa colorSpace lama', () => {
    const tex = { colorSpace: 'linear-srgb', anisotropy: 4 }
    uiTexture(tex)
    expect(tex.colorSpace).toBe('srgb')
    expect(tex.anisotropy).toBe(4)
  })

  it('aman utk null/undefined dan stub tanpa properti colorSpace', () => {
    expect(uiTexture(null)).toBe(null)
    expect(uiTexture(undefined)).toBe(undefined)
    const stub = {} // tanpa colorSpace
    expect(uiTexture(stub)).toBe(stub)
    expect(stub.colorSpace).toBe('srgb')
  })
})

describe('uiMaterial', () => {
  it('men-set toneMapped=false dan mengembalikan objek yang sama (chainable)', () => {
    const mat = { toneMapped: true }
    const out = uiMaterial(mat)
    expect(out).toBe(mat)
    expect(out.toneMapped).toBe(false)
  })

  it('aman utk null/undefined dan stub tanpa properti toneMapped', () => {
    expect(uiMaterial(null)).toBe(null)
    expect(uiMaterial(undefined)).toBe(undefined)
    const stub = {}
    expect(uiMaterial(stub)).toBe(stub)
    expect(stub.toneMapped).toBe(false)
  })
})
