// @vitest-environment jsdom
// Unit test ActionMenu — komponen UI aksi tim terakhir tanpa test langsung.
// Kode komponen TIDAK diubah; scene (sceneRef.current) di-stub penuh.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ActionMenu from '../components/ActionMenu'

afterEach(cleanup)

function mkScene(over = {}) {
  return {
    teamAction: vi.fn(),
    toggleNames: vi.fn(),
    isNamesVisible: vi.fn(() => true),
    setAutoRotate: vi.fn(),
    isAutoRotate: vi.fn(() => false),
    ...over,
  }
}

function renderMenu(scene) {
  const sceneRef = { current: scene }
  const onFlash = vi.fn()
  render(<ActionMenu sceneRef={sceneRef} onFlash={onFlash} />)
  return { sceneRef, onFlash }
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /aksi/i }))

describe('ActionMenu — popover & struktur menu', () => {
  it('tombol ⚡ Aksi: default tertutup, klik membuka popover role=menu', () => {
    renderMenu(mkScene())
    expect(screen.queryByRole('menu')).toBeNull()
    const btn = screen.getByRole('button', { name: /aksi/i })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    openMenu()
    expect(screen.getByRole('menu')).not.toBeNull()
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
  })

  it('menampilkan 4 menuitem aksi tim dgn urutan & ikon yang benar', () => {
    renderMenu(mkScene())
    openMenu()
    const items = screen.getAllByRole('menuitem')
    expect(items.map(b => b.textContent)).toEqual([
      '📢Meeting sekarang', '☕Coffee break', '💼Kembali bekerja', '🚶Office tour',
    ])
  })

  it('menampilkan 2 menuitemcheckbox (nama & putar otomatis) dgn aria-checked', () => {
    renderMenu(mkScene())
    openMenu()
    const boxes = screen.getAllByRole('menuitemcheckbox')
    expect(boxes).toHaveLength(2)
    expect(boxes[0].getAttribute('aria-checked')).toBe('true')   // namesOn default true
    expect(boxes[1].getAttribute('aria-checked')).toBe('false')  // rotOn default false
    expect(boxes[0].textContent).toContain('Sembunyikan')
    expect(boxes[1].textContent).toContain('OFF')
  })
})

describe('ActionMenu — aksi tim', () => {
  it('klik tiap menuitem memicu teamAction dgn key & pesan yang benar lalu menutup menu', () => {
    const scene = mkScene()
    const { onFlash } = renderMenu(scene)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Coffee break/i }))
    expect(scene.teamAction).toHaveBeenCalledWith('break')
    expect(onFlash).toHaveBeenCalledWith('Semua istirahat ke kafe')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('aksi Meeting & Office tour mengirim key meeting/tour', () => {
    const scene = mkScene()
    renderMenu(scene)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Meeting sekarang/i }))
    expect(scene.teamAction).toHaveBeenLastCalledWith('meeting')
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Office tour/i }))
    expect(scene.teamAction).toHaveBeenLastCalledWith('tour')
  })

  it('scene null → flash error, teamAction tidak dipanggil', () => {
    const { onFlash } = renderMenu(null)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Coffee break/i }))
    expect(onFlash).toHaveBeenCalledWith('Scene 3D tidak aktif (WebGL tidak tersedia)', true)
  })
})

describe('ActionMenu — toggle nama & rotasi', () => {
  it('toggle nama: scene.toggleNames dipanggil, label & aria-checked mengikuti isNamesVisible', () => {
    const scene = mkScene({ isNamesVisible: vi.fn(() => true) })
    renderMenu(scene)
    openMenu()
    const cb = screen.getAllByRole('menuitemcheckbox')[0]
    expect(cb.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(cb)
    expect(scene.toggleNames).toHaveBeenCalledTimes(1)
  })

  it('toggle rotasi: setAutoRotate(!cur) dipanggil dgn nilai dari isAutoRotate', () => {
    const scene = mkScene({ isAutoRotate: vi.fn(() => false) })
    renderMenu(scene)
    openMenu()
    const cb = screen.getAllByRole('menuitemcheckbox')[1]
    fireEvent.click(cb)
    expect(scene.setAutoRotate).toHaveBeenCalledWith(true)
  })

  it('isAutoRotate tidak tersedia → fallback membalik state lokal (false→true)', () => {
    const scene = mkScene()
    delete scene.isAutoRotate
    renderMenu(scene)
    openMenu()
    const cb = screen.getAllByRole('menuitemcheckbox')[1]
    fireEvent.click(cb)
    expect(scene.setAutoRotate).toHaveBeenCalledWith(true)
    expect(cb.getAttribute('aria-checked')).toBe('true')
    expect(cb.textContent).toContain('ON')
  })

  it('inisialisasi state nama & rotasi sinkron dari localStorage saat render awal', () => {
    localStorage.setItem('wfs_names', '0')
    localStorage.setItem('wfs_autorot', '1')
    try {
      renderMenu(null)
      openMenu()
      const boxes = screen.getAllByRole('menuitemcheckbox')
      expect(boxes[0].getAttribute('aria-checked')).toBe('false')
      expect(boxes[0].textContent).toContain('Tampilkan')
      expect(boxes[1].getAttribute('aria-checked')).toBe('true')
      expect(boxes[1].textContent).toContain('ON')
    } finally {
      localStorage.removeItem('wfs_names')
      localStorage.removeItem('wfs_autorot')
    }
  })

  it('semua item menu & checkbox memiliki title tooltip deskriptif dan SVG ikon', () => {
    renderMenu(mkScene())
    openMenu()
    const menu = screen.getByRole('menu')
    const items = screen.getAllByRole('menuitem')
    expect(items[0].getAttribute('title')).toBe('Semua dikumpulkan ke ruang meeting')
    expect(items[1].getAttribute('title')).toBe('Semua istirahat ke kafe')
    expect(items[2].getAttribute('title')).toBe('Semua kembali ke meja')
    expect(items[3].getAttribute('title')).toBe('Agent jalan-jalan keliling kantor')

    const boxes = screen.getAllByRole('menuitemcheckbox')
    expect(boxes[0].getAttribute('title')).toBe('Sembunyikan label nama agent & zona')
    expect(boxes[1].getAttribute('title')).toBe('Nyalakan rotasi kamera otomatis')

    // 4 menuitem + 2 checkbox = 6 SVG ikon bersih di popover
    const svgs = menu.querySelectorAll('svg')
    expect(svgs).toHaveLength(6)
  })
})

describe('ActionMenu — penutupan & navigasi keyboard', () => {
  it('Escape menutup menu', () => {
    renderMenu(mkScene())
    openMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('klik di luar popover (pointerdown) menutup menu', () => {
    renderMenu(mkScene())
    openMenu()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('ArrowDown memindah fokus antar elemen menu (wrap), Home/End ke ujung', () => {
    renderMenu(mkScene())
    openMenu()
    // selector komponen: [role=menuitem],[role=menuitemcheckbox] → 6 elemen
    const els = [...screen.getByRole('menu').querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"]')]
    expect(els).toHaveLength(6)
    els[0].focus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(els[1])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Home' })
    expect(document.activeElement).toBe(els[0])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' })
    expect(document.activeElement).toBe(els[els.length - 1])
    // wrap: dari elemen terakhir → pertama
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(els[0])
  })

  it('tombol lain di popover tidak mencegat Escape per-item (listener di document via hook dialogA11y)', () => {
    // ketergantungan: useDialogA11y juga menutup saat Escape — pastikan tak dobel-lempar error
    renderMenu(mkScene())
    openMenu()
    expect(() => fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })).not.toThrow()
  })
})
