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
})
