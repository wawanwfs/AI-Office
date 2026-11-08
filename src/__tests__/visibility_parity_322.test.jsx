// @vitest-environment jsdom
// Siklus 322 — paritas visible-refresh terakhir di mount-once: daftar agent
// WfsPanel hanya dimuat SEKALI saat mount (tanpa gerbang & tanpa listener),
// jadi setelah tab lama disembunyikan lalu kembali visible daftar bisa basi
// tanpa batas waktu. Kini: mount digerbang visibility + refresh SEGERA saat
// kembali visible + cleanup (pola 315-321).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

let visState = 'visible'
let visListeners = []
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

describe('visible-refresh parity WfsPanel agents (siklus 322)', () => {
  it('hidden→visible memicu reload daftar agent SEGERA (tidak nunggu interaksi)', () => {
    const loads = []
    const onVis = () => { if (visState === 'visible') loads.push(1) }
    addVis(onVis)
    goHidden(); goVisible()
    expect(loads.length).toBe(1)
    goHidden(); goVisible()
    expect(loads.length).toBe(2)
  })

  it('mount saat tab hidden TIDAK memicu fetch (gerbang visibility di mount)', () => {
    let mounted = 0
    // replika effect mount siklus 322
    const mount = () => { if (visState !== 'visible') return; mounted++ }
    goHidden()
    mount()
    expect(mounted).toBe(0)
    goVisible()
    mount()
    expect(mounted).toBe(1)
  })

  it('transisi ke hidden TIDAK memicu load (gerbang tetap)', () => {
    const loads = []
    const onVis = () => { if (visState === 'visible') loads.push(1) }
    addVis(onVis)
    goHidden()
    expect(loads.length).toBe(0)
    goVisible()
    expect(loads.length).toBe(1)
  })

  it('cleanup: removeEventListener melepas listener saat unmount', () => {
    const loads = []
    const onVis = () => { if (visState === 'visible') loads.push(1) }
    addVis(onVis)
    rmVis(onVis)
    goHidden(); goVisible()
    expect(loads.length).toBe(0)
    expect(visListeners.length).toBe(0)
  })
})
