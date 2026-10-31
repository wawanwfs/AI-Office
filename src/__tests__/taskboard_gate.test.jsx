// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TASKBOARD_GATE_LIMIT,
  taskBoardGateReceive,
  taskBoardGateFlush,
  taskBoardGateReset,
  isTaskBoardGateReady,
  dispatchTaskBoardEvent,
} from '../lib/taskboard_gate.js'

// Siklus 189: TaskBoard lazy — gerbang buffer+replay event papan.
// Dulu TaskBoard.jsx (komponen terbesar app, ~1815 baris + lib kanban_*) ikut
// bundle awal meski panelnya hanya terbuka saat dipakai; lazy-load memotong
// bundle awal TAPI event buka yang dikirim sebelum chunk siap akan HILANG
// (tidak ada listener) — pengguna klik "Papan" dan tak terjadi apa-apa.
// Kontrak: (1) sebelum flush → event dibuffer (TIDAK diteruskan, tidak ada
// listener yang bisa kelewat merespons), (2) flush → replay berurutan sinkron
// lalu gate lepas pasang permanen, (3) pasca flush → dispatch langsung jalur
// identik dulu, (4) anti-poisoning detail non-object, (5) batas buffer
// TASKBOARD_GATE_LIMIT (buang terua, simpan terbaru — setiap event set state
// final, bukan delta, jadi replay terakhir cukup).

const here = fileURLToPath(import.meta.url)
const dir = dirname(here)
const appSrc = readFileSync(resolve(dir, '../App.jsx'), 'utf-8')
const tbSrc = readFileSync(resolve(dir, '../components/TaskBoard.jsx'), 'utf-8')
const sceneSrc = readFileSync(resolve(dir, '../scene/OfficeScene.js'), 'utf-8')
const ppSrc = readFileSync(resolve(dir, '../components/ProjectPanel.jsx'), 'utf-8')
const aiSrc = readFileSync(resolve(dir, '../components/AgentInspector.jsx'), 'utf-8')
const tsSrc = readFileSync(resolve(dir, '../components/TeamStats.jsx'), 'utf-8')

describe('taskboard_gate — unit murni (buffer/replay/anti-poisoning)', () => {
  beforeEach(() => { taskBoardGateReset() })

  it('sebelum flush: event dibuffer, TIDAK diteruskan (return false)', () => {
    expect(isTaskBoardGateReady()).toBe(false)
    expect(taskBoardGateReceive('wfs-open-task-board', { view: 'kanban' })).toBe(false)
    expect(taskBoardGateReceive('wfs-toggle-task-board')).toBe(false)
  })

  it('flush: replay semua event terbuffer berurutan lalu gate siap (passthrough)', () => {
    const seen = []
    const h = (e) => seen.push([e.type, e.detail])
    window.addEventListener('wfs-open-task-board', h)
    window.addEventListener('wfs-toggle-task-board', h)
    try {
      taskBoardGateReceive('wfs-open-task-board', { view: 'kanban' })
      taskBoardGateReceive('wfs-toggle-task-board')
      expect(seen).toEqual([]) // belum ada listener pada saat buffering — justru inti gate
      taskBoardGateFlush()
      expect(seen.map((x) => x[0])).toEqual(['wfs-open-task-board', 'wfs-toggle-task-board'])
      expect(seen[0][1]).toEqual({ view: 'kanban' })
      expect(isTaskBoardGateReady()).toBe(true)
      // pasca flush: receive return true (passthrough — App dispatch sendiri)
      expect(taskBoardGateReceive('wfs-open-task-board', { view: 'list' })).toBe(true)
      // buffer kosong: flush kedua tanpa replay ganda (idempoten)
      const seen2 = []
      const h2 = (e) => seen2.push(e.type)
      window.addEventListener('wfs-open-task-board', h2)
      taskBoardGateFlush()
      window.removeEventListener('wfs-open-task-board', h2)
      expect(seen2).toEqual([])
    } finally {
      window.removeEventListener('wfs-open-task-board', h)
      window.removeEventListener('wfs-toggle-task-board', h)
    }
  })

  it('anti-poisoning: detail non-object (undefined/number/string) dibungkus {} — tak pernah throw', () => {
    expect(() => taskBoardGateReceive('wfs-open-task-board', undefined)).not.toThrow()
    expect(() => taskBoardGateReceive('wfs-open-task-board', 42)).not.toThrow()
    expect(() => taskBoardGateReceive('wfs-open-task-board', 'kanban')).not.toThrow()
    expect(() => taskBoardGateFlush()).not.toThrow()
    expect(isTaskBoardGateReady()).toBe(true)
  })

  it(`batas buffer ${'TASKBOARD_GATE_LIMIT'}: meluap → buang TERUA, simpan TERBARU`, () => {
    for (let i = 0; i < TASKBOARD_GATE_LIMIT + 3; i++) {
      taskBoardGateReceive('wfs-open-task-board', { n: i })
    }
    const seen = []
    const h = (e) => seen.push(e.detail.n)
    window.addEventListener('wfs-open-task-board', h)
    try {
      taskBoardGateFlush()
      // panjang dibatasi; replay terakhir = event TERBARU (bukan terua)
      expect(seen.length).toBe(TASKBOARD_GATE_LIMIT)
      expect(seen[seen.length - 1]).toBe(TASKBOARD_GATE_LIMIT + 2)
    } finally {
      window.removeEventListener('wfs-open-task-board', h)
    }
  })

  it('dispatchTaskBoardEvent: passthrough saat siap (dispatch nyata), buffer saat belum', () => {
    const seen = []
    const h = (e) => seen.push(e.type)
    window.addEventListener('wfs-toggle-task-board', h)
    try {
      // belum siap → dibuffer (listener tak melihat apa pun)
      dispatchTaskBoardEvent('wfs-toggle-task-board')
      expect(seen).toEqual([])
      // pasangan listener asli memasang diri → flush → replay
      taskBoardGateFlush()
      expect(seen).toEqual(['wfs-toggle-task-board'])
      // siap → dispatch langsung
      dispatchTaskBoardEvent('wfs-toggle-task-board')
      expect(seen).toEqual(['wfs-toggle-task-board', 'wfs-toggle-task-board'])
    } finally {
      window.removeEventListener('wfs-toggle-task-board', h)
    }
  })
})

describe('taskboard_gate — kontrak statis wiring (satu titik dispatch)', () => {
  it('App: TaskBoard lazy + router SATU TITIK (tanpa dispatch open langsung di App)', () => {
    expect(appSrc).toContain("const TaskBoard = lazy(() => import('./components/TaskBoard'))")
    expect(appSrc).toContain('from \'./lib/taskboard_gate.js\'')
    // semua pemicu App lewat router gate — bukan window.dispatchEvent langsung
    expect(appSrc).toContain("dispatchTaskBoardEvent('wfs-toggle-task-board')")
    expect(appSrc).toContain("dispatchTaskBoardEvent('wfs-cycle-div-preset', { backward: false })")
    expect(appSrc).toContain("dispatchTaskBoardEvent('wfs-open-task-board', { view: 'kanban' })")
    // onChunkReady hanya saat gate belum siap (pasca-flush prop hilang — kompat)
    expect(appSrc).toContain('onChunkReady={isTaskBoardGateReady() ? undefined : taskBoardGateFlush}')
    // tak ada lagi dispatch open/toggle langsung di App (satuan kebenaran)
    expect(appSrc).not.toContain("window.dispatchEvent(new CustomEvent('wfs-open-task-board'")
    expect(appSrc).not.toContain("window.dispatchEvent(new CustomEvent('wfs-toggle-task-board'")
  })

  it('TaskBoard: onChunkReady dipanggil sekali di mount (useEffect kosong) + prop opsional', () => {
    expect(tbSrc).toContain('onChunkReady')
    expect(tbSrc).toContain('if (typeof onChunkReady === \'function\') onChunkReady()')
  })

  it('SEMUA pemicu lain (scene/panel/inspector/stats) lewat router gate', () => {
    // OfficeScene (whiteboard 3D + openSprintBoard + __openTaskBoard)
    expect(sceneSrc).toContain("dispatchTaskBoardEvent('wfs-open-task-board'")
    expect(sceneSrc).not.toContain("new CustomEvent('wfs-open-task-board'")
    // ProjectPanel, AgentInspector, TeamStats
    expect(ppSrc).toContain("dispatchTaskBoardEvent('wfs-open-task-board'")
    expect(ppSrc).not.toContain("new CustomEvent('wfs-open-task-board'")
    expect(aiSrc).toContain("dispatchTaskBoardEvent('wfs-open-task-board'")
    expect(aiSrc).not.toContain("new CustomEvent('wfs-open-task-board'")
    expect(tsSrc).toContain("dispatchTaskBoardEvent('wfs-open-task-board'")
    expect(tsSrc).not.toContain("new CustomEvent('wfs-open-task-board'")
  })
})
