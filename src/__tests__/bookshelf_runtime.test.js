// @vitest-environment jsdom
// Unit test runtime createBookshelf (bookshelf.js): rak buku dinding kiri
// belakang — frame 0x5D4037, 4 papan 0x8D6E63, buku warna acak 8 palet.
// node_modules TANPA paket `canvas`; THREE di-stub minimal, asersi via mesh.
import { describe, it, expect } from 'vitest'

class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o = {}) { Object.assign(this, { opacity: 1, color: 0, transparent: false }, o) } }
class Obj {
  constructor() {
    this.children = []
    this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.rotation = {}; this.visible = true; this.castShadow = false
  }
  add(o) { this.children.push(o) }
  traverse(fn) { this.children.forEach(fn) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}
const THREE = { Mesh, Group: Obj, BoxGeometry: Geom, MeshLambertMaterial: Mat }

// rng deterministik: r(min,max)=min + frac seq; pick=cycle dari 0
function makeRng() {
  let i = 0
  const fracs = [0.0, 0.5, 0.25, 0.75, 0.1, 0.9, 0.4, 0.6]
  return {
    r(min, max) { const f = fracs[i++ % fracs.length]; return min + (max - min) * f },
    pick(arr) { return arr[(i++) % arr.length] },
  }
}

function makeCtx() {
  const office = new Obj()
  const M = (c, o) => new Mat({ color: c, ...o })
  return { THREE, office, M, rng: makeRng(), added: office.children }
}

async function build(ctx) {
  const { createBookshelf } = await import('../scene/parts/bookshelf.js')
  return { refs: createBookshelf(ctx), ...ctx }
}

describe('createBookshelf — rak buku kantor 3D', () => {
  it('mengembalikan referensi lengkap: shelf (Group) + books (array)', async () => {
    const { refs } = await build(makeCtx())
    expect(refs.shelf).toBeInstanceOf(Obj)
    expect(Array.isArray(refs.books)).toBe(true)
    expect(refs.books.length).toBeGreaterThan(0)
    refs.books.forEach((b) => expect(b).toBeInstanceOf(Mesh))
  })

  it('office menerima tepat 1 grup shelf', async () => {
    const { added, refs } = await build(makeCtx())
    expect(added).toHaveLength(1)
    expect(added[0]).toBe(refs.shelf)
  })

  it('frame 0x5D4037 0.5×2.2×2.4 di (−11.9, 1.1, −6) + 4 papan 0x8D6E63 0.48×0.03×2.3 y=.35+lvl*.55', async () => {
    const { refs } = await build(makeCtx())
    const kids = refs.shelf.children
    expect(kids[0].geometry.args).toEqual([0.5, 2.2, 2.4])
    expect(kids[0].material.color).toBe(0x5D4037)
    expect(kids[0].position).toMatchObject({ x: -11.9, y: 1.1, z: -6 })
    const boards = kids.filter((k) => k.material.color === 0x8D6E63)
    expect(boards).toHaveLength(4)
    boards.forEach((b, lvl) => {
      expect(b.geometry.args).toEqual([0.48, 0.03, 2.3])
      expect(b.position.y).toBeCloseTo(0.35 + lvl * 0.55)
      expect(b.position.x).toBe(-11.9)
      expect(b.position.z).toBe(-6)
    })
  })

  it('buku: tinggi acak .28–.4, tebal .09–.16, 8 warna palet, berjajar +bw+.015 mulai z=SBZ−1.05, y=.35+lvl*.55+.17, x=SBX+.02', async () => {
    const { refs } = await build(makeCtx())
    const bookCols = [0xEF5350, 0xFFCA28, 0x42A5F5, 0x66BB6A, 0xAB47BC, 0xFF7043, 0x26C6DA, 0xEC407A]
    const books = refs.books
    expect(books.length).toBeGreaterThan(30) // 4 rak × ~9+ buku
    // semua buku warna dari palet
    books.forEach((b) => expect(bookCols).toContain(b.material.color))
    // buku pertama lvl 0: z mulai SBZ−1.05 + bw/2; rng.r(0,.07)=0 → bw=.09
    expect(books[0].position.z).toBeCloseTo(-6 - 1.05 + 0.045)
    expect(books[0].position.x).toBeCloseTo(-11.9 + 0.02)
    expect(books[0].position.y).toBeCloseTo(0.35 + 0.17)
    // geometri buku pertama: bw=rng.r(0,.07)=.09 (frac 0), tinggi=rng.r(.28,.4)=.34 (frac .5)
    expect(books[0].geometry.args).toEqual([0.34, 0.34, 0.09])
    // buku kedua: urutan rng per buku = r(0,.07), r(.28,.4), pick(warna).
    // fracs=[0,.5,.25,.75,...] → bw2=.09+.07*.75=.1425 → z = prev+.09+.015+.1425/2
    expect(books[1].position.z).toBeCloseTo(-6 - 1.05 + 0.09 + 0.015 + 0.1425 / 2)
    // buku pertama lvl 1 posisinya setelah barisan lvl 0; y-nya +0.55
    const lvl1 = books.find((b) => b.position.y > 0.9)
    expect(lvl1.position.y).toBeCloseTo(0.35 + 0.55 + 0.17)
  })

  it('dua pemanggilan dgn rng berbeda menghasilkan buku yang tidak share mesh', async () => {
    const a = await build(makeCtx())
    const b = await build(makeCtx())
    expect(a.refs.books).not.toBe(b.refs.books)
    expect(a.refs.shelf).not.toBe(b.refs.shelf)
    expect(a.refs.shelf.children[0]).not.toBe(b.refs.shelf.children[0])
  })
})
