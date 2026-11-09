// @vitest-environment jsdom
// Siklus 326: ShConsole wajib mendaftar di flag modal TERPUSAT (useModalFlag).
// Defek: konsol drawer terbuka TIDAK menaikkan anyModalOpen() & App tidak
// menghitung showConsoleS di modalOpen → shortcut global + orbit panah scene
// tetap jalan "menembus" overlay konsol (panel lain terbuka tersembunyi).
import React, { useRef } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import ShConsole from '../components/ShConsole'
import { anyModalOpen } from '../lib/modal'

afterEach(() => { cleanup(); document.body.innerHTML = '' })

function mount(show) {
  return render(<ShConsole show={show} onClose={() => {}} />)
}

describe('ShConsole — flag modal terpusat (siklus 326)', () => {
  it('konsol terbuka menaikkan anyModalOpen() (shortcut global terblokir)', () => {
    expect(anyModalOpen()).toBe(false)
    mount(true)
    // Effect terpasang pasca render — flush microtask React.
    return Promise.resolve().then(() => {
      expect(anyModalOpen()).toBe(true)
    })
  })

  it('konsol tertutup (show=false) TIDAK menaikkan flag modal', () => {
    mount(false)
    return Promise.resolve().then(() => {
      expect(anyModalOpen()).toBe(false)
    })
  })

  it('unmount melepas flag — count kembali 0 (tak sticky)', () => {
    const u = mount(true)
    return Promise.resolve().then(() => {
      expect(anyModalOpen()).toBe(true)
      u.unmount()
      expect(anyModalOpen()).toBe(false)
    })
  })

  it('toggle show false→true→false: flag naik lalu turun (panel tidak pernah unmount)', () => {
    const u = mount(false)
    return Promise.resolve().then(() => {
      u.rerender(<ShConsole show={true} onClose={() => {}} />)
      return Promise.resolve().then(() => {
        expect(anyModalOpen()).toBe(true)
        u.rerender(<ShConsole show={false} onClose={() => {}} />)
        return Promise.resolve().then(() => {
          expect(anyModalOpen()).toBe(false)
        })
      })
    })
  })
})
