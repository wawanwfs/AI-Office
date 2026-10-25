// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FloorNavigator from '../components/FloorNavigator'

afterEach(() => cleanup())

describe('FloorNavigator', () => {
  it('menampilkan navigasi 3 lantai kantor', () => {
    render(<FloorNavigator />)
    expect(screen.getByRole('navigation', { name: /Navigasi Lantai/i })).toBeTruthy()
    expect(screen.getByText('L1 · Product')).toBeTruthy()
    expect(screen.getByText('L2 · Engineering')).toBeTruthy()
    expect(screen.getByText('L3 · Quality')).toBeTruthy()
  })

  it('memanggil onSelectFloor saat tombol lantai diklik', () => {
    const onSelect = vi.fn()
    render(<FloorNavigator onSelectFloor={onSelect} />)

    fireEvent.click(screen.getByText('L2 · Engineering'))
    expect(onSelect).toHaveBeenCalledWith(2, 'l2')

    fireEvent.click(screen.getByText('L3 · Quality'))
    expect(onSelect).toHaveBeenCalledWith(3, 'l3')

    fireEvent.click(screen.getByText('L1 · Product'))
    expect(onSelect).toHaveBeenCalledWith(1, 'l1')
  })
})
