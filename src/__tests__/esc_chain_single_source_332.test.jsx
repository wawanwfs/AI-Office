// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import fs from 'node:fs'
import TaskBoard from '../components/TaskBoard.jsx'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const src = fs.readFileSync('src/components/TaskBoard.jsx', 'utf8')

describe('siklus 332: rantai Escape TaskBoard satu sumber', () => {
  it('handler poll Escape memanggil onEscRef — tidak ada rantai if/else duplikat', () => {
    expect(src).toContain("if (e.key === 'Escape') onEscRef.current()")
    // Rantai prioritas hanya didefinisikan SEKALI (di closeBoard)
    const chains = src.split('showDivPresetCreator)').length - 1
    expect(chains).toBe(1) // hanya definisi closeBoard — duplikat hilang
  })

  it('Escape 1 (q terisi di input) hanya mengosongkan q; papan tetap terbuka; Escape 2 menutup', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }))
    vi.stubGlobal('fetch', f)
    render(<TaskBoard />)
    await act(async () => {})
    await act(async () => { window.dispatchEvent(new CustomEvent('wfs-open-task-board')) })
    const input = screen.queryByPlaceholderText(/Cari judul/)
    expect(input).toBeTruthy()
    await act(async () => { fireEvent.change(input, { target: { value: 'halo' } }); input.focus() })
    await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }) })
    expect(input.value).toBe('') // q dikosongkan
    expect(document.getElementById('task-board')).toBeTruthy() // papan TETAP terbuka
    await act(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }) })
    expect(document.getElementById('task-board')).toBeFalsy() // Escape kedua menutup
  })

  it('closeBoard stabil via useCallback + onEscRef sinkron tiap render', () => {
    expect(src).toMatch(/const closeBoard = useCallback\(\(\) => \{/)
    expect(src).toContain('useEffect(() => { onEscRef.current = closeBoard })')
  })
})
