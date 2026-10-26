// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SettingsModal from '../components/SettingsModal'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('SettingsModal component', () => {
  let mockScene
  let mockToggleMute
  let mockToggleTheme
  let mockClose
  let mockFlash

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: {},
      getItem(k) { return this.store[k] ?? null },
      setItem(k, v) { this.store[k] = String(v) },
      removeItem(k) { delete this.store[k] },
      clear() { this.store = {} },
    })
    mockToggleMute = vi.fn()
    mockToggleTheme = vi.fn()
    mockClose = vi.fn()
    mockFlash = vi.fn()
    mockScene = {
      getAudioVolume: vi.fn(() => 1.0),
      setAudioVolume: vi.fn(),
      testAudio: vi.fn(() => true),
      playSelect: vi.fn(),
      playTaskDone: vi.fn(),
      isNamesVisible: vi.fn(() => true),
      toggleNames: vi.fn(),
      isAutoRotate: vi.fn(() => false),
      setAutoRotate: vi.fn(),
    }
  })

  it('tidak render apa pun jika show = false', () => {
    const { container } = render(
      <SettingsModal
        show={false}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={false}
        onToggleMute={mockToggleMute}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('render dialog pengaturan saat show = true', () => {
    render(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={false}
        onToggleMute={mockToggleMute}
      />
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Pengaturan Kantor 3D')).toBeTruthy()
    expect(screen.getByLabelText('Volume master audio')).toBeTruthy()
  })

  it('slider volume merespon perubahan dan memanggil scene.setAudioVolume', () => {
    render(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={false}
        onToggleMute={mockToggleMute}
      />
    )
    const slider = screen.getByLabelText('Volume master audio')
    expect(slider.value).toBe('1')

    fireEvent.change(slider, { target: { value: '0.6' } })
    expect(mockScene.setAudioVolume).toHaveBeenCalledWith(0.6)
    expect(slider.value).toBe('0.6')
  })

  it('tombol preset volume (25%, 50%, 80%, 100%) mengubah volume langsung', () => {
    render(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={false}
        onToggleMute={mockToggleMute}
      />
    )
    const btn50 = screen.getByRole('button', { name: '50%' })
    expect(btn50).toBeTruthy()
    expect(btn50.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(btn50)
    expect(mockScene.setAudioVolume).toHaveBeenCalledWith(0.5)
    expect(btn50.getAttribute('aria-pressed')).toBe('true')

    const btn80 = screen.getByRole('button', { name: '80%' })
    fireEvent.click(btn80)
    expect(mockScene.setAudioVolume).toHaveBeenCalledWith(0.8)
    expect(btn80.getAttribute('aria-pressed')).toBe('true')
    expect(btn50.getAttribute('aria-pressed')).toBe('false')
  })

  it('tombol mute toggle memanggil onToggleMute dan mencerminkan state via aria-pressed', () => {
    const { rerender } = render(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={false}
        onToggleMute={mockToggleMute}
      />
    )
    const muteBtn = screen.getByRole('button', { name: 'Bisukan suara' })
    expect(muteBtn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(muteBtn)
    expect(mockToggleMute).toHaveBeenCalled()

    // saat muted = true, label berubah jadi aksi nyalakan + aria-pressed true
    rerender(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={true}
        onToggleMute={mockToggleMute}
      />
    )
    const unmuteBtn = screen.getByRole('button', { name: 'Nyalakan suara' })
    expect(unmuteBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('slider dan tombol uji dinonaktifkan saat muted = true', () => {
    render(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={true}
        onToggleMute={mockToggleMute}
      />
    )
    const slider = screen.getByLabelText('Volume master audio')
    expect(slider.disabled).toBe(true)

    const testBtn = screen.getByRole('button', { name: /Task Done/i })
    expect(testBtn.disabled).toBe(true)
  })

  it('uji sampel audio memanggil scene.testAudio dengan tipe sampel yang tepat', () => {
    render(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={false}
        onToggleMute={mockToggleMute}
      />
    )
    const btnDone = screen.getByRole('button', { name: /Task Done/i })
    fireEvent.click(btnDone)
    expect(mockScene.testAudio).toHaveBeenCalledWith('done')

    const btnSelect = screen.getByRole('button', { name: /Blip Klik/i })
    fireEvent.click(btnSelect)
    expect(mockScene.testAudio).toHaveBeenCalledWith('select')

    const btnFail = screen.getByRole('button', { name: /Task Fail/i })
    fireEvent.click(btnFail)
    expect(mockScene.testAudio).toHaveBeenCalledWith('fail')

    const btnUrgent = screen.getByRole('button', { name: /Task Urgent/i })
    fireEvent.click(btnUrgent)
    expect(mockScene.testAudio).toHaveBeenCalledWith('urgent')
  })

  it('toggle visual: nama agen, auto-rotate, dan tema ruang', () => {
    render(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={false}
        cyberpunk={false}
        onToggleTheme={mockToggleTheme}
        onFlash={mockFlash}
      />
    )
    // Toggle nama
    const btnName = screen.getByRole('button', { name: 'Tampak' })
    fireEvent.click(btnName)
    expect(mockScene.toggleNames).toHaveBeenCalled()

    // Toggle rotate
    const btnRot = screen.getByRole('button', { name: 'Nonaktif' })
    fireEvent.click(btnRot)
    expect(mockScene.setAutoRotate).toHaveBeenCalledWith(true)

    // Toggle tema
    const btnTheme = screen.getByRole('button', { name: 'Mode Terang' })
    fireEvent.click(btnTheme)
    expect(mockToggleTheme).toHaveBeenCalled()
  })

  it('tombol X dan Selesai memanggil onClose', () => {
    render(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={false}
      />
    )
    const closeBtn = screen.getByRole('button', { name: 'Tutup pengaturan' })
    fireEvent.click(closeBtn)
    expect(mockClose).toHaveBeenCalledTimes(1)

    const doneBtn = screen.getByRole('button', { name: 'Selesai' })
    fireEvent.click(doneBtn)
    expect(mockClose).toHaveBeenCalledTimes(2)
  })

  it('menekan tombol Escape menutup modal', () => {
    render(
      <SettingsModal
        show={true}
        onClose={mockClose}
        sceneRef={{ current: mockScene }}
        muted={false}
      />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockClose).toHaveBeenCalled()
  })
})
