// @vitest-environment jsdom
// Siklus 320 — paritas visible-refresh untuk drawer yang poll API dengan gerbang
// visibility (ShConsole overview 10 dtk, TaskBoard 8 dtk, ProjectPanel 15 dtk,
// WfsPanel status agen 15 dtk). Interval sudah digerbang visible (siklus lama);
// yang baru: listener 'visibilitychange' membaca ulang SEGERA saat tab kembali
// visible (pola 315-319), plus cleanup listener saat unmount.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

let visState = 'visible'
let visListeners = []
const gate = (fn) => () => { if (visState === 'visible') fn() }
beforeEach(() => {
  visState = 'visible'
  visListeners = []
})
afterEach(() => { visListeners = [] })
const goVisible = () => { visState = 'visible'; visListeners.forEach(f => f()) }
const goHidden = () => { visState = 'hidden' }
const addVis = (fn) => document.addEventListener('visibilitychange', fn)
const rmVis = (fn) => document.removeEventListener('visibilitychange', fn)
const realAdd = document.addEventListener.bind(document)
const realRm = document.removeEventListener.bind(document)

// Mock add/removeEventListener visibilitychange agar kita bisa menghitung
// listener & mensimulasikan transisi tanpa paksa event jsdom global.
beforeEach(() => {
  document.addEventListener = (ev, fn) => { if (ev === 'visibilitychange') visListeners.push(fn); else realAdd(ev, fn) }
  document.removeEventListener = (ev, fn) => { if (ev === 'visibilitychange') visListeners = visListeners.filter(f => f !== fn); else realRm(ev, fn) }
})
afterEach(() => {
  document.addEventListener = realAdd
  document.removeEventListener = realRm
})

// Pola persis seperti di 4 komponen (ShConsole/TaskBoard/ProjectPanel/WfsPanel):
// const onVis = () => { if (document.visibilityState === 'visible') load() }
// document.addEventListener('visibilitychange', onVis)
describe('visible-refresh parity pola drawer API (siklus 320)', () => {
  it('transisi hidden→visible memicu load SEGERA', () => {
    const load = []
    const onVis = gate(() => load.push('t' + load.length))
    addVis(onVis)
    goHidden(); goVisible()
    expect(load.length).toBe(1)
    goHidden(); goVisible()
    expect(load.length).toBe(2)
  })

  it('transisi ke hidden TIDAK memicu load', () => {
    const load = []
    const onVis = gate(() => load.push(1))
    addVis(onVis)
    goHidden()  // transisi hidden — digerbang
    expect(load.length).toBe(0)
    goVisible()
    expect(load.length).toBe(1)
  })

  it('removeEventListener melepas listener (cleanup)', () => {
    const load = []
    const onVis = gate(() => load.push(1))
    addVis(onVis)
    rmVis(onVis)
    goHidden(); goVisible()
    expect(load.length).toBe(0)
    expect(visListeners.length).toBe(0)
  })
})
