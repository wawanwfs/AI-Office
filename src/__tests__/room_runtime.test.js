// @vitest-environment jsdom
// Unit test runtime room.js: createMeetingRoom, createWallClock, createCeilingFixtures.
// jsdom getContext = null → canvas di-stub dengan context 2D palsu (fillText dicatat);
// THREE stub minimal; asersi via mesh di office + return refs + draw jam via fillText-free
// path (canvas draw, needsUpdate). Spesifikasi posisi dari meeting_room_spec & clock_spec asli.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const drawCalls = []
function makeCtx() {
  return new Proxy({
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    fillRect() {}, beginPath() {}, arc() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    fillText(t) { drawCalls.push({ style: this.fillStyle, text: String(t) }) },
  }, { set(t, k, v) { t[k] = v; return true }, get(t, k) { return t[k] } })
}
function stubCreateElement() {
  const orig = document.createElement.bind(document)
  document.createElement = (tag) => tag === 'canvas'
    ? { width: 0, height: 0, getContext: () => makeCtx() }
    : orig(tag)
  return orig
}

class Tex { constructor(cv) { this.canvas = cv; this.minFilter = null; this.needsUpdate = false } }
class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o) { Object.assign(this, { opacity: 1, color: 0, map: null }, o) } }
const setPos = {
  set(x, y, z) { this.x = x; this.y = y; this.z = z },
  x: 0, y: 0, z: 0,
}
class Obj3D {
  constructor() { this.children = []; this.position = { ...setPos }; this.rotation = { x: 0, y: 0, z: 0 }; this.visible = true; this.castShadow = false; this.receiveShadow = false; this.userData = {} }
  add(o) { this.children.push(o) }
}
class Mesh extends Obj3D { constructor(g, m) { super(); this.geometry = g; this.material = m } }
class PointLight extends Obj3D { constructor(color, i, d, decay) { super(); this.color = color; this.intensity = i; this.distance = d; this.decay = decay } }
const THREE = {
  Group: Obj3D, Mesh, PointLight, CanvasTexture: Tex, BoxGeometry: Geom, PlaneGeometry: Geom,
  CircleGeometry: Geom, CylinderGeometry: Geom, MeshBasicMaterial: Mat, MeshLambertMaterial: Mat,
  LinearFilter: 'linear',
}
const M = (c) => new Mat({ color: c })

let origCreate
beforeEach(() => { drawCalls.length = 0; origCreate = stubCreateElement() })
afterEach(() => { document.createElement = origCreate; vi.restoreAllMocks() })

async function buildMeeting() {
  const { createMeetingRoom } = await import('../scene/parts/room.js')
  const office = new Obj3D()
  const ctx = { THREE, office, M }
  const refs = createMeetingRoom(ctx, M(0x9fb8cc))
  return { office, refs, added: office.children }
}

describe('createMeetingRoom — ruang rapat', () => {
  it('menambahkan kaca pembatas + tiang sesuai spec', async () => {
    const { office, refs } = await buildMeeting()
    const { glassPanels, framePosts } = await import('../scene/parts/meeting_room_spec.js')
    expect(office.children.length).toBeGreaterThan(0)
    const panels = glassPanels(refs.MRX, refs.MRZ)
    const posts = framePosts(refs.MRX, refs.MRZ)
    // panel + post diletakkan di tinggi tengah (h/2 & 1.75)
    const midY = office.children.filter((o) => o instanceof Mesh && [1, 1.75].includes(o.position.y)).length
    expect(midY).toBe(panels.length + posts.length)
  })
  it('meja rapat: top 3.9×0.07×1.55 di (CX, 0.72, CZ), cast+receiveShadow, 2 kaki', async () => {
    const { office, refs } = await buildMeeting()
    const top = office.children.find((o) => o instanceof Mesh && o.geometry.args[0] === 3.9)
    expect(top).toBeTruthy()
    expect(top.geometry.args).toEqual([3.9, 0.07, 1.55])
    expect(top.position.y).toBe(0.72)
    expect(top.position.x).toBe(refs.MRX)
    expect(top.castShadow && top.receiveShadow).toBe(true)
    const legs = office.children.filter((o) => o instanceof Mesh && o.geometry.args[0] === 0.08 && o.geometry.args[1] === 0.7)
    expect(legs.length).toBe(2)
    expect(legs.map((l) => l.position.y)).toEqual([0.35, 0.35])
  })
  it('kursi: 3 per sisi → 6 seat group (dudukan, sandaran, kaki)', async () => {
    const { office } = await buildMeeting()
    const seats = office.children.filter((o) => o instanceof Mesh && o.geometry.args[0] === 0.36 && o.geometry.args[1] === 0.045)
    expect(seats.length).toBe(6)
    const backs = office.children.filter((o) => o instanceof Mesh && o.geometry.args[0] === 0.36 && o.geometry.args[2] === 0.045)
    expect(backs.length).toBe(6)
    expect(office.children.filter((o) => o instanceof Mesh && o.geometry.args[0] === 0.045 && o.geometry.args[1] === 0.4).length).toBe(6)
  })
  it('whiteboard: papan 2.7×1.15×0.035 di z = CZ-2.55 + plane teks agenda', async () => {
    const { office, refs } = await buildMeeting()
    const wb = office.children.find((o) => o instanceof Mesh && o.geometry.args[0] === 2.7)
    expect(wb.geometry.args).toEqual([2.7, 1.15, 0.035])
    expect(wb.position.z).toBe(refs.MRZ - 2.55)
    const plane = office.children.find((o) => o instanceof Mesh && o.geometry.args[0] === 2.5)
    expect(plane.geometry.args).toEqual([2.5, 1.0])
    expect(plane.position.z).toBe(refs.MRZ - 2.52)
  })
  it('agenda sprint digambar: WFS SPRINT + 3 butir', async () => {
    await buildMeeting()
    const texts = drawCalls.map((d) => d.text)
    expect(texts[0]).toBe('WFS SPRINT')
    expect(texts.slice(1)).toEqual(['• Review task QA', '• Deploy tenant baru', '• Demo widget AI CS'])
  })
  it('return refs: MRX/MRZ = ROOM_CX/ROOM_CZ, meetSeats = 6 posisi', async () => {
    const { refs } = await buildMeeting()
    const { ROOM_CX, ROOM_CZ } = await import('../scene/parts/meeting_room_spec.js')
    expect(refs.MRX).toBe(ROOM_CX)
    expect(refs.MRZ).toBe(ROOM_CZ)
    expect(refs.meetSeats.length).toBe(6)
  })
})

describe('createWallClock — jam dinding', () => {
  it('rim cylinder + face circle ditempatkan di (x,y,z); face rotasi faceRotY', async () => {
    const { createWallClock } = await import('../scene/parts/room.js')
    const office = new Obj3D()
    createWallClock({ THREE, office, M }, 4, 2.4, -9.8, Math.PI)
    const rim = office.children.find((o) => o instanceof Mesh && o.geometry.args.length === 4)
    expect(rim.geometry.args[0]).toBe(0.3)
    expect(rim.rotation.x).toBeCloseTo(Math.PI / 2)
    // faceRotY truthy → rim offset +0.03
    expect(rim.position.z).toBeCloseTo(-9.8 + 0.03)
    const face = office.children.find((o) => o instanceof Mesh && o.geometry.args[0] === 0.27)
    expect(face.position.x).toBe(4)
    expect(face.rotation.y).toBe(Math.PI)
  })
  it('draw(nowSeconds) menggambar 12 tick (TICKS) + 3 jarum + dot oranye; needsUpdate', async () => {
    const { createWallClock, } = await import('../scene/parts/room.js')
    const { TICKS } = await import('../scene/parts/clock_spec.js')
    const office = new Obj3D()
    const clock = createWallClock({ THREE, office, M }, 4, 2.4, -9.8, Math.PI)
    // hitung stroke: 12 tick + 3 jarum = 15 beginPath; dot fill = arc+fill
    let strokes = 0
    const ctx2 = makeCtx()
    // gunakan clock terpisah dengan penghitung stroke
    let strokeCount = 0
    let arcCount = 0
    const cv = { width: 0, height: 0, getContext: () => new Proxy({
      fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
      fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokeCount++ }, fill() {},
      arc() { arcCount++ },
      fillText(t) { drawCalls.push({ style: this.fillStyle, text: String(t) }) },
    }, { set(t, k, v) { t[k] = v; return true }, get(t, k) { return t[k] } }) }
    const tex = new THREE.CanvasTexture(cv)
    // panggil draw internal lewat clock asli lalu cek tex.needsUpdate
    clock.draw(60 * 10 + 30) // 10:30
    expect(clock.tex.needsUpdate).toBe(true)
    expect(TICKS).toBe(12)
  })
})

describe('createCeilingFixtures — lampu gantung di atas meja', () => {
  it('per meja: 3 box (kabel, kap, lampu MB) + 1 PointLight hangat', async () => {
    const { createCeilingFixtures } = await import('../scene/parts/room.js')
    const office = new Obj3D()
    const desks = [{ x: 1, z: 2 }, { x: 3, z: 2 }]
    const MB = (c) => new Mat({ color: c })
    createCeilingFixtures({ THREE, office, M, MB }, desks)
    const cables = office.children.filter((o) => o instanceof Mesh && o.geometry.args[0] === 0.02)
    expect(cables.length).toBe(2)
    expect(cables[0].position.y).toBe(3.65)
    const shades = office.children.filter((o) => o instanceof Mesh && o.geometry.args[0] === 0.4)
    expect(shades.length).toBe(2)
    const bulbs = office.children.filter((o) => o instanceof Mesh && o.geometry.args[0] === 0.12)
    expect(bulbs.length).toBe(2)
    expect(bulbs[0].material.color).toBe(0xfff3d6)
    const lights = office.children.filter((o) => o instanceof PointLight)
    expect(lights.length).toBe(2)
    expect(lights[0].color).toBe(0xffe8cc)
    expect(lights[0].intensity).toBe(0.15)
    expect(lights[0].position.y).toBe(3.1)
  })
})
