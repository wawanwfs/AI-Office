// Unit test painter layar resepsionis (lobby_screen.js, siklus 525) — murni,
// ctx recorder tanpa THREE/DOM. Pola sign_canvas.test.js / logo_canvas.test.js.
import { describe, it, expect } from 'vitest'
import {
  LS_W, LS_H, LS_BG,
  lobbyClockText, lobbyStatusText, lobbyAgentsText, lobbyScreenKey, drawLobbyScreen,
} from '../scene/parts/lobby_screen.js'
import { officeStatusAt } from '../scene/parts/office_hours.js'

function rec() {
  const ops = []
  const fonts = [] // font yang AKTIF saat tiap fillText dipanggil
  const fills = [] // fillStyle yang AKTIF saat tiap operasi fill dipanggil
  const h = (name) => (...args) => { ops.push([name, ...args]); fills.push(ctx.fillStyle) }
  const ctx = {
    ops,
    fonts,
    fills,
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    fillRect: h('fillRect'), strokeRect: h('strokeRect'),
    fillText: (...args) => { ops.push(['fillText', ...args]); fonts.push(ctx.font); fills.push(ctx.fillStyle) },
  }
  return ctx
}

describe('lobbyClockText', () => {
  it('format HH:MM dari menit simulasi', () => {
    expect(lobbyClockText(0)).toBe('00:00')
    expect(lobbyClockText(605)).toBe('10:05')
    expect(lobbyClockText(9 * 60 + 5)).toBe('09:05') // pad dua digit
    expect(lobbyClockText(1439)).toBe('23:59')
  })
  it('wrap aman di luar 0…1439 & non-finite → --:--', () => {
    expect(lobbyClockText(1440)).toBe('00:00')
    expect(lobbyClockText(1500)).toBe('01:00')
    expect(lobbyClockText(-10)).toBe('23:50')
    expect(lobbyClockText(NaN)).toBe('--:--')
    expect(lobbyClockText(undefined)).toBe('--:--')
    expect(lobbyClockText(Infinity)).toBe('--:--')
  })
})

describe('lobbyStatusText / lobbyAgentsText', () => {
  it('delegasi satu sumber office_hours', () => {
    expect(lobbyStatusText(610)).toBe(officeStatusAt(610))
    expect(lobbyStatusText(730)).toBe('Istirahat makan siang')
    expect(lobbyStatusText(0)).toBe('Shift malam · WFS online')
  })
  it('non-finite → label netral (bukan NaN di layar)', () => {
    expect(lobbyStatusText(NaN)).toBe('WFS Project · HQ')
    expect(lobbyStatusText(undefined)).toBe('WFS Project · HQ')
  })
  it('jumlah agen: bilangan & guard non-finite/0/negatif', () => {
    expect(lobbyAgentsText(26)).toBe('26 AGEN BERTUGAS')
    expect(lobbyAgentsText(1)).toBe('1 AGEN BERTUGAS')
    expect(lobbyAgentsText(0)).toBe('AGEN SIAP')
    expect(lobbyAgentsText(NaN)).toBe('AGEN SIAP')
    expect(lobbyAgentsText(-3)).toBe('AGEN SIAP')
    expect(lobbyAgentsText(26.9)).toBe('26 AGEN BERTUGAS') // dibulatkan ke bawah
  })
})

describe('lobbyScreenKey (kunci redraw per menit-sim)', () => {
  it('menit bulat wrap 0…1439', () => {
    expect(lobbyScreenKey(724.9)).toBe(724)
    expect(lobbyScreenKey(1445)).toBe(5)
    expect(lobbyScreenKey(-1)).toBe(1439)
  })
  it('non-finite → null (pemanggil tak menggambar)', () => {
    expect(lobbyScreenKey(NaN)).toBe(null)
    expect(lobbyScreenKey(Infinity)).toBe(null)
  })
})

describe('drawLobbyScreen (256×160)', () => {
  it('latar 0xA1628 penuh + bingkai stroke tepi', () => {
    const c = rec()
    drawLobbyScreen(c, { minutes: 610, agents: 26 })
    expect(c.fills[0]).toBe(LS_BG) // fillStyle aktif saat fillRect pertama
    expect(c.ops[0]).toEqual(['fillRect', 0, 0, LS_W, LS_H])
    expect(c.strokeStyle).toBe('rgba(245,158,11,0.55)') // properti (bukan op) — bingkai
    expect(c.lineWidth).toBe(2)
    expect(c.ops[1]).toEqual(['strokeRect', 1, 1, LS_W - 2, LS_H - 2])
  })
  it('judul WFS · LOBBY + jam besar center di (128,96)', () => {
    const c = rec()
    drawLobbyScreen(c, { minutes: 9 * 60, agents: 26 })
    const texts = c.ops.filter(o => o[0] === 'fillText')
    expect(texts[0]).toEqual(['fillText', 'WFS · LOBBY', 16, 30])
    const clock = texts.find(o => o[1] === '09:00')
    expect(clock).toEqual(['fillText', '09:00', LS_W / 2, 96])
    expect(c.fonts[texts.indexOf(clock)]).toContain('900 54px') // font aktif saat jam digambar
  })
  it('baris fase + footer kiri/kanan', () => {
    const c = rec()
    drawLobbyScreen(c, { minutes: 725, agents: 26 })
    const texts = c.ops.filter(o => o[0] === 'fillText').map(o => o[1])
    expect(texts).toContain('Istirahat makan siang')
    expect(texts).toContain('RESEPSIONIS · 24/7')
    expect(texts).toContain('26 AGEN BERTUGAS')
  })
  it('default opts aman → jam --:-- & agen siap (frame awal)', () => {
    const c = rec()
    drawLobbyScreen(c)
    const texts = c.ops.filter(o => o[0] === 'fillText').map(o => o[1])
    expect(texts).toContain('--:--')
    expect(texts).toContain('AGEN SIAP')
    expect(texts).toContain('WFS Project · HQ')
  })
})
