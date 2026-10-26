import { describe, it, expect, vi } from 'vitest'
import {
  KANBAN_COL_TO_STATUS,
  STATUS_TO_KANBAN_COL,
  setupCardDragData,
  canDropTaskInColumn,
  resolveNewStatusForColumn,
  formatDragDropNotification,
  calcMobileColumnWidth,
} from '../lib/kanban_drag'

describe('kanban_drag module', () => {
  describe('konstanta pemetaan status', () => {
    it('memiliki pemetaan kolom ke status task model yang valid', () => {
      expect(KANBAN_COL_TO_STATUS.todo).toBe('pending')
      expect(KANBAN_COL_TO_STATUS.in_progress).toBe('in_progress')
      expect(KANBAN_COL_TO_STATUS.review).toBe('review')
      expect(KANBAN_COL_TO_STATUS.done).toBe('completed')
    })

    it('memetakan variasi status task ke kunci kolom kanban', () => {
      expect(STATUS_TO_KANBAN_COL.pending).toBe('todo')
      expect(STATUS_TO_KANBAN_COL.todo).toBe('todo')
      expect(STATUS_TO_KANBAN_COL.in_progress).toBe('in_progress')
      expect(STATUS_TO_KANBAN_COL.progress).toBe('in_progress')
      expect(STATUS_TO_KANBAN_COL.review).toBe('review')
      expect(STATUS_TO_KANBAN_COL.completed).toBe('done')
      expect(STATUS_TO_KANBAN_COL.done).toBe('done')
    })
  })

  describe('setupCardDragData', () => {
    it('mengembalikan false jika dataTransfer atau task tidak valid', () => {
      expect(setupCardDragData(null, { id: 1 })).toBe(false)
      expect(setupCardDragData({}, null)).toBe(false)
      expect(setupCardDragData({}, {})).toBe(false)
      expect(setupCardDragData({}, { id: undefined })).toBe(false)
    })

    it('menyetel text/plain, application/json, dan effectAllowed move', () => {
      const dataStore = {}
      const mockDt = {
        setData: vi.fn((k, v) => {
          dataStore[k] = v
        }),
        effectAllowed: 'none',
      }
      const task = { id: 42, title: 'Optimasi WebGL', status: 'in_progress', priority: 'high' }

      const res = setupCardDragData(mockDt, task)
      expect(res).toBe(true)
      expect(mockDt.setData).toHaveBeenCalledWith('text/plain', '42')
      expect(mockDt.setData).toHaveBeenCalledWith('application/json', JSON.stringify({
        id: 42,
        title: 'Optimasi WebGL',
        status: 'in_progress',
        priority: 'high',
      }))
      expect(mockDt.effectAllowed).toBe('move')
    })

    it('aman terhadap kegagalan parsial mime type pada browser restriktif', () => {
      const mockDt = {
        setData: vi.fn((k) => {
          if (k === 'application/json') throw new Error('Mime type unsupported')
        }),
      }
      const task = { id: 7, title: 'Test Fallback' }
      expect(setupCardDragData(mockDt, task)).toBe(true)
      expect(mockDt.setData).toHaveBeenCalledWith('text/plain', '7')
    })
  })

  describe('canDropTaskInColumn', () => {
    it('mengembalikan false jika task atau targetColKey kosong', () => {
      expect(canDropTaskInColumn(null, 'done')).toBe(false)
      expect(canDropTaskInColumn({ id: 1, status: 'pending' }, '')).toBe(false)
    })

    it('mengembalikan false jika task sudah berada di kolom tujuan', () => {
      expect(canDropTaskInColumn({ id: 1, status: 'pending' }, 'todo')).toBe(false)
      expect(canDropTaskInColumn({ id: 2, status: 'in_progress' }, 'in_progress')).toBe(false)
      expect(canDropTaskInColumn({ id: 3, status: 'completed' }, 'done')).toBe(false)
    })

    it('mengembalikan true jika task berpindah ke kolom berbeda', () => {
      expect(canDropTaskInColumn({ id: 1, status: 'pending' }, 'in_progress')).toBe(true)
      expect(canDropTaskInColumn({ id: 1, status: 'pending' }, 'done')).toBe(true)
      expect(canDropTaskInColumn({ id: 2, status: 'in_progress' }, 'review')).toBe(true)
      expect(canDropTaskInColumn({ id: 3, status: 'review' }, 'done')).toBe(true)
    })
  })

  describe('resolveNewStatusForColumn', () => {
    it('mengembalikan status yang tepat untuk masing-masing kolom', () => {
      expect(resolveNewStatusForColumn('todo')).toBe('pending')
      expect(resolveNewStatusForColumn('in_progress')).toBe('in_progress')
      expect(resolveNewStatusForColumn('review')).toBe('review')
      expect(resolveNewStatusForColumn('done')).toBe('completed')
    })

    it('fallback ke targetColKey jika tidak ada di pemetaan, atau pending jika kosong', () => {
      expect(resolveNewStatusForColumn('archived')).toBe('archived')
      expect(resolveNewStatusForColumn('')).toBe('pending')
      expect(resolveNewStatusForColumn(null)).toBe('pending')
    })
  })

  describe('formatDragDropNotification', () => {
    it('memformat pesan notifikasi flash dengan tepat', () => {
      expect(formatDragDropNotification({ id: 5 }, 'done', 'Selesai')).toBe(
        'Task #5 dipindahkan ke kolom Selesai'
      )
      expect(formatDragDropNotification({ id: 12 }, 'review')).toBe(
        'Task #12 dipindahkan ke kolom review'
      )
    })

    it('mengembalikan string kosong jika task tidak valid', () => {
      expect(formatDragDropNotification(null, 'done')).toBe('')
      expect(formatDragDropNotification({}, 'done')).toBe('')
    })
  })

  describe('calcMobileColumnWidth', () => {
    it('mengembalikan nilai fallback jika containerWidth tidak valid', () => {
      expect(calcMobileColumnWidth(0)).toBe(170)
      expect(calcMobileColumnWidth(-100)).toBe(170)
      expect(calcMobileColumnWidth(NaN)).toBe(170)
      expect(calcMobileColumnWidth(Infinity)).toBe(170)
      expect(calcMobileColumnWidth(null)).toBe(170)
    })

    it('menghitung lebar kolom nyaman pada layar smartphone (<480px)', () => {
      // iPhone SE / kecil: 375px -> 375 * 0.78 = ~293px
      const w375 = calcMobileColumnWidth(375)
      expect(w375).toBeGreaterThanOrEqual(220)
      expect(w375).toBeLessThanOrEqual(300)
      expect(w375).toBe(293)

      // Layar ultra narrow: 260px -> 260 * 0.78 = 203 -> dibatasi min 220
      expect(calcMobileColumnWidth(260)).toBe(220)
    })

    it('menghitung lebar kolom pada layar tablet / phablet (<768px)', () => {
      // 600px -> 600 * 0.45 = 270 -> dibatasi max 260
      expect(calcMobileColumnWidth(600)).toBe(260)
      // 500px -> 500 * 0.45 = 225
      expect(calcMobileColumnWidth(500)).toBe(225)
    })

    it('menghitung pembagian merata pada layar lebar / desktop (>=768px)', () => {
      // 800px / 4 kolom = 200px
      expect(calcMobileColumnWidth(800, 4)).toBe(200)
      // 1000px / 4 kolom = 250px
      expect(calcMobileColumnWidth(1000, 4)).toBe(250)
      // Sangat banyak kolom (misal 10) -> Math.max(160, ...) -> 160
      expect(calcMobileColumnWidth(800, 10)).toBe(160)
    })
  })
})
