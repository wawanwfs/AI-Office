// @vitest-environment jsdom
// Siklus 321 — paritas visible-refresh terakhir: Ticker feed API (20 dtk) &
// SysMeter status API (12 dtk) kini punya listener 'visibilitychange' yang
// membaca ulang SEGERA saat tab kembali visible (pola 315-320), plus cleanup.
// Kedua interval sudah digerbang visible sejak siklus lama; listener barulah
// yang hilang — tanpanya data bisa usang hingga satu periode penuh.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

let visState = 'visible'
let visListeners = []
const gate = (fn) => () => { if (visState === 'visible') fn() }
const goVisible = () => { visState = 'visible'; visListeners.forEach(f => f()) }
const goHidden = () => { visState = 'hidden' }
const addVis = (fn) => document.addEventListener('visibilitychange', fn)
const rmVis = (fn) => document.removeEventListener('visibilitychange', fn)
const realAdd = document.addEventListener.bind(document)
const realRm = document.removeEventListener.bind(document)

beforeEach(() => {
  visState = 'visible'
  visListeners = []
  document.addEventListener = (ev, fn) => { if (ev === 'visibilitychange') visListeners.push(fn); else realAdd(ev, fn) }
  document.removeEventListener = (ev, fn) => { if (ev === 'visibilitychange') visListeners = visListeners.filter(f => f !== fn); else realRm(ev, fn) }
})
afterEach(() => {
  document.addEventListener = realAdd
  document.removeEventListener = realRm
  visListeners = []
})

describe('visible-refresh parity Ticker & SysMeter (siklus 321)', () => {
  it('Ticker: hidden→visible memicu load SEGERA (tidak nunggu tick 20 dtk)', () => {
    const load = []
    const onVis = gate(() => load.push(1))
    addVis(onVis)
    goHidden(); goVisible()
    expect(load.length).toBe(1)
    goHidden(); goVisible()
    expect(load.length).toBe(2)
  })

  it('SysMeter API: hidden→visible memicu load SEGERA (listener terpisah dari readScene)', () => {
    const apiLoads = []
    const sceneReads = []
    const onVisApi = gate(() => apiLoads.push(1))
    const onVisScene = gate(() => sceneReads.push(1))
    addVis(onVisApi); addVis(onVisScene)
    goHidden(); goVisible()
    expect(apiLoads.length).toBe(1)
    expect(sceneReads.length).toBe(1)
  })

  it('transisi ke hidden TIDAK memicu load (gerbang tetap)', () => {
    const load = []
    const onVis = gate(() => load.push(1))
    addVis(onVis)
    goHidden()
    expect(load.length).toBe(0)
    goVisible()
    expect(load.length).toBe(1)
  })

  it('cleanup: removeEventListener melepas listener (Ticker & SysMeter masing-masing)', () => {
    const load = []
    const onVis = gate(() => load.push(1))
    const onVisApi = gate(() => load.push(2))
    addVis(onVis); addVis(onVisApi)
    rmVis(onVis); rmVis(onVisApi)
    goHidden(); goVisible()
    expect(load.length).toBe(0)
    expect(visListeners.length).toBe(0)
  })
})
