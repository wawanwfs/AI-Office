// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FloorNavigator from '../components/FloorNavigator'

afterEach(() => cleanup())

describe('FloorNavigator', () => {
  it('menampilkan navigasi 3 lantai kantor dengan penamaan autentik', () => {
    render(<FloorNavigator />)
    expect(screen.getByRole('navigation', { name: /Navigasi Lantai/i })).toBeTruthy()
    expect(screen.getByText('L1 · Ops & AI')).toBeTruthy()
    expect(screen.getByText('L2 · Engineering')).toBeTruthy()
    expect(screen.getByText('L3 · Executive')).toBeTruthy()
  })

  it('memanggil onSelectFloor saat tombol lantai diklik', () => {
    const onSelect = vi.fn()
    render(<FloorNavigator onSelectFloor={onSelect} />)

    fireEvent.click(screen.getByText('L2 · Engineering'))
    expect(onSelect).toHaveBeenCalledWith(2, 'l2')

    fireEvent.click(screen.getByText('L3 · Executive'))
    expect(onSelect).toHaveBeenCalledWith(3, 'l3')

    fireEvent.click(screen.getByText('L1 · Ops & AI'))
    expect(onSelect).toHaveBeenCalledWith(1, 'l1')
  })

  it('menyinkronkan activeFloor saat prop currentFloor berubah', () => {
    const { rerender } = render(<FloorNavigator currentFloor={1} />)
    const btnL1 = screen.getByText('L1 · Ops & AI').closest('button')
    const btnL2 = screen.getByText('L2 · Engineering').closest('button')

    expect(btnL1.getAttribute('aria-pressed')).toBe('true')
    expect(btnL2.getAttribute('aria-pressed')).toBe('false')

    rerender(<FloorNavigator currentFloor={2} />)
    expect(btnL1.getAttribute('aria-pressed')).toBe('false')
    expect(btnL2.getAttribute('aria-pressed')).toBe('true')
  })

  it('menyinkronkan activeFloor dari prop currentFloor bahkan setelah tombol lantai diklik manual', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<FloorNavigator currentFloor={1} onSelectFloor={onSelect} />)
    const btnL2 = screen.getByText('L2 · Engineering').closest('button')
    const btnL3 = screen.getByText('L3 · Executive').closest('button')

    // Pengguna klik L2 secara manual
    fireEvent.click(btnL2)
    expect(onSelect).toHaveBeenCalledWith(2, 'l2')

    // App memperbarui currentFloor ke 3 (misal akibat seleksi agen / shortcut)
    rerender(<FloorNavigator currentFloor={3} onSelectFloor={onSelect} />)
    expect(btnL3.getAttribute('aria-pressed')).toBe('true')
    expect(btnL2.getAttribute('aria-pressed')).toBe('false')
  })

  it('navigasi lantai dengan tombol panah keyboard (ArrowRight & ArrowLeft)', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<FloorNavigator currentFloor={1} onSelectFloor={onSelect} />)
    const nav = screen.getByRole('navigation', { name: /Navigasi Lantai/i })

    // Tekan ArrowRight: pindah dari L1 ke L2
    fireEvent.keyDown(nav, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith(2, 'l2')

    // Perbarui prop currentFloor ke 2
    rerender(<FloorNavigator currentFloor={2} onSelectFloor={onSelect} />)

    // Tekan ArrowLeft: pindah kembali dari L2 ke L1
    fireEvent.keyDown(nav, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith(1, 'l1')
  })

  it('mode uncontrolled: mengelola activeFloor internal saat tidak ada prop currentFloor', () => {
    render(<FloorNavigator />)
    const btnL1 = screen.getByText('L1 · Ops & AI').closest('button')
    const btnL2 = screen.getByText('L2 · Engineering').closest('button')

    expect(btnL1.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(btnL2)
    expect(btnL2.getAttribute('aria-pressed')).toBe('true')
    expect(btnL1.getAttribute('aria-pressed')).toBe('false')
  })
})
