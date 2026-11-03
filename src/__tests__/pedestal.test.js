// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createPedestal, PLINTH, LIP, SHADOW, GLOW } from '../scene/parts/pedestal.js'
import { drawPlatformShadow, SHADOW_SIZE, SHADOW_CENTER } from '../scene/parts/pedestal_canvas.js'

class Geom { constructor(...a) { this.args = a } }
class Mat {
  constructor(o = {}) {
    const col = o.color !== undefined ? o.color : 0
    this.opacity = o.opacity !== undefined ? o.opacity : 1
    this.transparent = !!o.transparent
    this.depthWrite = o.depthWrite
    this.map = o.map
    this.color = { set: (c) => { this._c = c } }
    this.color.set(col)
  }
}
class Obj {
  constructor() {
    this.children = []
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.rotation = { x: 0, y: 0, z: 0 }
    this.visible = true
    this.userData = {}
  }
  add(o) { this.children.push(o) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}
const THREE = {
  Mesh, Group: Obj, BoxGeometry: Geom, PlaneGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat,
  CanvasTexture: class { constructor(src) { this.src = src } },
}

const fakeCtx = () => ({
  fillStyle: '',
  createRadialGradient: () => ({ addColorStop() {} }),
  fillRect() {},
})

beforeAll(() => {
  const orig = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (String(tag).toLowerCase() === 'canvas') {
      const c = { width: 300, height: 150, style: {} }
      c.getContext = () => fakeCtx()
      return c
    }
    return orig(tag)
  })
})

const dims = (geo) => geo.args // [w,h,d] BoxGeometry

describe('createPedestal — plinth + lip emas + bayangan kontak + glow rim (revisi 239)', () => {
  it('menghasilkan 4 mesh utama dan menambahkannya ke group yang diberikan', () => {
    const office = new Obj()
    const M = (c) => new Mat({ color: c })
    const MB = (c) => new Mat({ color: c })
    const res = createPedestal({ THREE, M, MB, group: office })
    expect(office.children).toContain(res.group)
    expect(res.group.children.length).toBe(4)
    expect(res.plinth && res.lip && res.shadow && res.glow).toBeTruthy()
    expect(res.made.length).toBe(4)
  })

  it('KONTRAK TERLIHAT: seluruh plinth di BAWAH dasar dek L1 (-0.20) & wajah depan DI DEPAN bibir dek', () => {
    // Regresi revisi-1: plinth top -0.08 tertanam di dek & wajah depan di belakang
    // bibir dek → elemen ada di scene tapi 0 piksel terlihat (audit vision_analyze).
    const M = (c) => new Mat({ color: c })
    const MB = (c) => new Mat({ color: c })
    const res = createPedestal({ THREE, M, MB, group: new Obj() })
    const [, h] = dims(res.plinth.geometry)
    expect(PLINTH.TOP_Y).toBeLessThanOrEqual(-0.20)          // tak menembus dek terendah
    expect(res.plinth.position.y + h / 2).toBeCloseTo(PLINTH.TOP_Y, 5)
    // wajah depan plinth LEBIH DEKAT ke kamera daripada bibir dek (z=-13.9)
    const frontFaceZ = res.plinth.position.z - dims(res.plinth.geometry)[2] / 2
    expect(frontFaceZ).toBeLessThan(-13.9)
    expect(PLINTH.W).toBeGreaterThan(34)                     // lebih lebar dari dek
    expect(PLINTH.H).toBeGreaterThanOrEqual(0.9)             // cukup tinggi utk terbaca
    expect(SHADOW.Y).toBeLessThan(PLINTH.TOP_Y - PLINTH.H)   // di bawah dasar plinth
  })

  it('bayangan kontak: plane horizontal lebih luas dari plinth, depthWrite false, renderOrder 1, blob', () => {
    const M = (c) => new Mat({ color: c })
    const MB = (c) => new Mat({ color: c })
    const res = createPedestal({ THREE, M, MB, group: new Obj() })
    const [sw] = dims(res.shadow.geometry) // PlaneGeometry → [w,h]
    expect(sw).toBeGreaterThan(PLINTH.W)
    expect(res.shadow.rotation.x).toBeCloseTo(-Math.PI / 2)
    expect(res.shadow.material.depthWrite).toBe(false)
    expect(res.shadow.material.transparent).toBe(true)
    expect(res.shadow.renderOrder).toBe(1)
    expect(res.shadow.userData.blob).toBe(true)
    const calls = []
    const ctx = {
      fillStyle: '',
      createRadialGradient: () => { calls.push('grad'); return { addColorStop: () => calls.push('stop') } },
      fillRect: () => calls.push('fill'),
    }
    drawPlatformShadow(ctx)
    expect(calls[0]).toBe('grad')
    expect(calls).toContain('stop')
    expect(SHADOW_SIZE).toBe(128)
    expect(SHADOW_CENTER).toBe(64)
  })

  it('lip emas & glow cyan: warna sesuai bahasa terraces, glow transparan menyala di wajah depan', () => {
    const M = (c) => new Mat({ color: c })
    const MB = (c) => new Mat({ color: c })
    const res = createPedestal({ THREE, M, MB, group: new Obj() })
    expect(res.lip.material._c).toBe(LIP.COLOR)              // 0xD4AF37 emas trim terraces
    expect(res.glow.material._c).toBe(GLOW.COLOR)            // 0x00E5FF cyan LED L2
    expect(res.glow.material.transparent).toBe(true)
    expect(res.glow.material.opacity).toBeGreaterThan(0.5)
    // glow menempel di wajah depan plinth, sedikit proud (lebih dekat kamera)
    expect(res.glow.position.z).toBeLessThan(PLINTH.FRONT_Z)
    // glow di bagian bawah wajah plinth
    expect(res.glow.position.y).toBeLessThan(PLINTH.TOP_Y - PLINTH.H / 2)
  })

  it('bekerja tanpa argumen group (guard) — objek tetap dibuat', () => {
    const M = (c) => new Mat({ color: c })
    const MB = (c) => new Mat({ color: c })
    const res = createPedestal({ THREE, M, MB })
    expect(res.group.children.length).toBe(4)
  })
})
