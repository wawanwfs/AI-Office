// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import AgentInspector from '../components/AgentInspector'

afterEach(() => { cleanup(); document.body.innerHTML = '' })

describe('AgentInspector — kartu profil agen 3D', () => {
  const mockAgent = {
    name: 'Wahyu Fajar Setiawan',
    role: 'Founder / CEO',
    hex: '#F59E0B',
  }

  it('mengembalikan null jika agent kosong / null', () => {
    const { container } = render(<AgentInspector agent={null} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('menampilkan nama agen, role, status dan model AI saat agent dipilih', () => {
    render(<AgentInspector agent={mockAgent} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(screen.getByText('Wahyu Fajar Setiawan')).toBeTruthy()
    expect(screen.getByText('Founder / CEO')).toBeTruthy()
    expect(screen.getByText('WFS PROJECT')).toBeTruthy()
    expect(screen.getByText('OmniRoute / GLM-5')).toBeTruthy()
    expect(screen.getByText('Lokasi Lantai')).toBeTruthy()
  })

  it('menampilkan badge lokasi lantai dinamis jika agent.floor disediakan', () => {
    const l1Agent = { ...mockAgent, name: 'Aris', role: 'Solution Architect', floor: 1 }
    const { rerender } = render(<AgentInspector agent={l1Agent} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(screen.getByText('L1 · Ops & AI')).toBeTruthy()

    rerender(<AgentInspector agent={{ ...mockAgent, floor: 2 }} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(screen.getByText('L2 · Engineering')).toBeTruthy()

    rerender(<AgentInspector agent={{ ...mockAgent, floor: 3 }} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(screen.getByText('L3 · Executive')).toBeTruthy()
  })

  it('klik tombol tutup memanggil onClose', () => {
    const onClose = vi.fn()
    render(<AgentInspector agent={mockAgent} onClose={onClose} onChatWith={vi.fn()} />)
    const btn = screen.getByLabelText('Tutup kartu agen')
    expect(btn.getAttribute('title')).toBe('Tutup profil agen (Esc)')
    fireEvent.click(btn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('klik tombol chat memanggil onChatWith dan onClose', () => {
    const onClose = vi.fn()
    const onChat = vi.fn()
    render(<AgentInspector agent={mockAgent} onClose={onClose} onChatWith={onChat} />)
    fireEvent.click(screen.getByText(/Buka Chat dengan/))
    expect(onChat).toHaveBeenCalledWith(mockAgent)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('menekan tombol Escape memanggil onClose', () => {
    const onClose = vi.fn()
    render(<AgentInspector agent={mockAgent} onClose={onClose} onChatWith={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
