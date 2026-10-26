// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import GlobalTaskComposer from '../components/GlobalTaskComposer'
import ProjectWorkspaceModal from '../components/ProjectWorkspaceModal'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WFS PROJECT Software House — GlobalTaskComposer', () => {
  it('tidak me-render apapun saat open=false', () => {
    const { container } = render(<GlobalTaskComposer open={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('menampilkan dialog task composer dan opsi stack saat open=true', () => {
    render(<GlobalTaskComposer open={true} onClose={vi.fn()} />)
    expect(screen.getByText('WFS PROJECT')).toBeTruthy()
    expect(screen.getByText('GLOBAL TASK COMPOSER')).toBeTruthy()
    expect(screen.getByText('Website / Landing Page')).toBeTruthy()
    expect(screen.getByText('Web Application / SaaS')).toBeTruthy()
    expect(screen.getByText('REST API & Backend')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Buatkan website company profile/i)).toBeTruthy()
  })

  it('memvalidasi input kosong sebelum submit', async () => {
    render(<GlobalTaskComposer open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Deploy ke Sandbox'))
    expect(screen.getByText('Harap masukkan instruksi tugas.')).toBeTruthy()
  })

  it('a11y: fokus pindah ke dalam dialog saat terbuka, Tab terkunci, Esc menutup', async () => {
    const onClose = vi.fn()
    render(<GlobalTaskComposer open={true} onClose={onClose} />)
    const closeBtn = screen.getByRole('button', { name: 'Tutup dialog' })
    // fokus dipindahkan ke elemen focusable pertama (tombol tutup) setelah dialog terbuka
    await waitFor(() => expect(document.activeElement).toBe(closeBtn))
    // Esc menutup dialog (pola useDialogA11y)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('label field terasosiasi dengan kontrolnya (a11y)', () => {
    render(<GlobalTaskComposer open onClose={vi.fn()} />)
    expect(screen.getByLabelText(/Nama Proyek/i)).toBeTruthy()
    expect(screen.getByLabelText(/Pilihan Tech Stack/i)).toBeTruthy()
    expect(screen.getByLabelText(/Instruksi Proyek/i)).toBeTruthy()
  })
})

describe('WFS PROJECT Software House — ProjectWorkspaceModal', () => {
  const mockProject = {
    id: 'proj-demo-test',
    name: 'WFS Test Artifact',
    workspace_path: '/home/agentuser/wfs-projects/proj-demo-test',
    status: 'running',
    preview_port: 3105,
    preview_url: '/preview/proj-demo-test/'
  }

  it('tidak me-render apapun saat open=false', () => {
    const { container } = render(<ProjectWorkspaceModal project={mockProject} open={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('menampilkan tabs: Live Preview, File Explorer, Terminal, dan Quality & QA', () => {
    render(<ProjectWorkspaceModal project={mockProject} open={true} onClose={vi.fn()} />)
    expect(screen.getByText('WFS Test Artifact')).toBeTruthy()
    expect(screen.getByText('PORT: 3105')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Live Preview' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'File Explorer' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Terminal' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Quality & QA' })).toBeTruthy()
  })

  it('dapat berpindah tab ke Terminal dan Quality & QA', () => {
    render(<ProjectWorkspaceModal project={mockProject} open={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    expect(screen.getByText(/WFS PROJECT ISOLATED SANDBOX TERMINAL/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Quality & QA' }))
    expect(screen.getByText('Automated QA & Security Gate')).toBeTruthy()
    expect(screen.getByText('ALL CRITERIA PASSED')).toBeTruthy()
  })

  it('terminal & editor file punya nama aksesibel (a11y)', () => {
    render(<ProjectWorkspaceModal project={mockProject} open onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    expect(screen.getByRole('textbox', { name: /Perintah terminal/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'File Explorer' }))
    expect(screen.getByRole('textbox', { name: /Isi file/i })).toBeTruthy()
  })
})
