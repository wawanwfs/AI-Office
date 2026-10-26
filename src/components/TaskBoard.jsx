import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '../lib/api'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { parseFileList } from '../lib/files'
import { setupCardDragData, canDropTaskInColumn, formatDragDropNotification } from '../lib/kanban_drag'
import { calcSearchStats, getSearchMatchSegments, getKanbanColumnSearchEmptyState } from '../lib/kanban_search'
import { exportTasks } from '../lib/kanban_export'
import {
  DATE_RANGE_PRESETS,
  computeDateRangeStats,
  formatTaskDate,
  formatDateRangeSummary,
  parseTaskTimestamp,
  normalizeCustomDateRange,
  formatCustomDateRange,
} from '../lib/kanban_date'
import { IconBoard, IconClose, IconPlay, IconRotate, IconList, IconKanban, IconSearch, IconDownload, IconCalendar } from './Icons'
import {
  KANBAN_COLUMNS,
  getTaskRoleLabel,
  getTaskCardBadges,
  matchTaskDivision,
  groupTasksByKanbanColumn,
  computeSprintMetrics,
  extractTaskDivisions,
  filterTasks,
  computeColumnDistribution,
  getTaskPriorityInfo,
  computePriorityBreakdown,
  SORT_OPTIONS,
  canMoveTaskToColumn,
  moveTaskToColumn,
  getKanbanColumnKey,
  computeTagCloud,
  normalizeTagList,
  TAG_PRESETS,
  PRESET_ICONS,
  TAG_PALETTE,
  loadCustomPresets,
  saveCustomPresets,
  createCustomPreset,
  deleteCustomPreset,
  getAllPresets,
  getTagPreset,
  isPresetActive,
  computePresetStats,
  toggleTagInFilter,
  formatTagFilterSummary,
  DIVISION_PRESET_ICONS,
  normalizeDivisionList,
  loadCustomDivPresets,
  saveCustomDivPresets,
  createCustomDivPreset,
  deleteCustomDivPreset,
  getAllDivisionPresets,
  getDivisionPreset,
  isDivisionPresetActive,
  computeDivisionPresetStats,
  toggleDivisionInFilter,
  formatDivisionFilterSummary,
} from '../scene/parts/kanban_spec'
import { TEAMS, findTeamByRole, findTeamByAgent } from '../scene/parts/team_spec'

const ST = { done: ['Selesai', '#10E5A0'], running: ['Jalan', '#F59E0B'], review: ['Review', '#448AFF'], failed: ['Gagal', '#ef4444'], pending: ['Antri', '#9aa7b8'] }
const FILTERS = [['all', 'Semua'], ['pending', 'Antri'], ['running', 'Jalan'], ['done', 'Selesai'], ['failed', 'Gagal']]

// Papan Task: daftar nyata dari task engine, filter divisi/status, kanban view, detail, jalankan per task.
export default function TaskBoard({ onFlash, onAsk }) {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState(null)
  const [err, setErr] = useState(false)
  const [filter, setFilter] = useState('all')
  const [division, setDivision] = useState('all')
  const [selectedTag, setSelectedTag] = useState('all')
  const [tagMode, setTagMode] = useState('any') // 'any' (OR) | 'all' (AND)
  const [dateRange, setDateRange] = useState('all') // 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'list' | 'kanban'
  const [sortBy, setSortBy] = useState('newest') // 'newest' | 'oldest' | 'priority' | 'title' | 'agent'
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [customPresets, setCustomPresets] = useState(() => {
    try {
      return loadCustomPresets(typeof localStorage !== 'undefined' ? localStorage : null)
    } catch {
      return []
    }
  })
  const [showPresetCreator, setShowPresetCreator] = useState(false)
  const [presetFormName, setPresetFormName] = useState('')
  const [presetFormIcon, setPresetFormIcon] = useState('⚡')
  const [presetFormColor, setPresetFormColor] = useState('#38BDF8')
  const [presetFormTags, setPresetFormTags] = useState([])

  const [customDivPresets, setCustomDivPresets] = useState(() => {
    try {
      return loadCustomDivPresets(typeof localStorage !== 'undefined' ? localStorage : null)
    } catch {
      return []
    }
  })
  const [showDivPresetCreator, setShowDivPresetCreator] = useState(false)
  const [divPresetFormName, setDivPresetFormName] = useState('')
  const [divPresetFormIcon, setDivPresetFormIcon] = useState('⚡')
  const [divPresetFormColor, setDivPresetFormColor] = useState('#38BDF8')
  const [divPresetFormDivisions, setDivPresetFormDivisions] = useState([])
  const board = useRef(null)
  const searchInputRef = useRef(null)
  useModalFlag(open || !!sel)
  const onEscRef = useRef(() => {})
  useEffect(() => {
    onEscRef.current = () => {
      if (showDivPresetCreator) {
        setShowDivPresetCreator(false)
      } else if (showPresetCreator) {
        setShowPresetCreator(false)
      } else if (q && document.activeElement === searchInputRef.current) {
        setQ('')
      } else if (sel) {
        setSel(null)
      } else {
        setOpen(false)
      }
    }
  })
  const closeBoard = useCallback(() => onEscRef.current(), [])
  useDialogA11y({ open: open || !!sel, onClose: closeBoard, ref: board })

  // Pintasan keyboard: '/' untuk fokus cepat ke input pencarian
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === '/' && !sel) {
        const tag = e.target?.tagName?.toLowerCase()
        if (tag !== 'input' && tag !== 'textarea' && !e.target?.isContentEditable) {
          e.preventDefault()
          searchInputRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, sel])

  const activeTags = useMemo(() => normalizeTagList(selectedTag), [selectedTag])

  const handleTagClick = useCallback((tagKey, e) => {
    const isMulti = Boolean(e && (e.shiftKey || e.ctrlKey || e.metaKey))
    setSelectedTag((prev) => toggleTagInFilter(tagKey, prev, { multi: isMulti }))
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [])

  const handlePresetClick = useCallback((presetKey) => {
    setSelectedTag((prev) => {
      if (isPresetActive(presetKey, prev, customPresets)) {
        return 'all'
      }
      const p = getTagPreset(presetKey, customPresets)
      return p ? p.tags : 'all'
    })
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [customPresets])

  const handleSaveCustomPreset = useCallback((e) => {
    if (e && e.preventDefault) e.preventDefault()
    const name = presetFormName.trim()
    if (!name || presetFormTags.length === 0) return

    const newPreset = createCustomPreset({
      label: name,
      tags: presetFormTags,
      icon: presetFormIcon,
      color: presetFormColor,
    }, customPresets)

    if (!newPreset) return

    const updated = [...customPresets, newPreset]
    setCustomPresets(updated)
    try {
      saveCustomPresets(typeof localStorage !== 'undefined' ? localStorage : null, updated)
    } catch { /* ignore */ }

    setSelectedTag(newPreset.tags)
    setShowPresetCreator(false)
    setPresetFormName('')
    if (onFlash) onFlash(`Preset kustom "${newPreset.label}" berhasil disimpan`)
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [presetFormName, presetFormTags, presetFormIcon, presetFormColor, customPresets, onFlash])

  const handleDeleteCustomPreset = useCallback((presetKey, e) => {
    if (e && e.stopPropagation) e.stopPropagation()
    const found = customPresets.find(p => p.key === presetKey)
    const label = found?.label || presetKey

    const updated = deleteCustomPreset(presetKey, customPresets)
    setCustomPresets(updated)
    try {
      saveCustomPresets(typeof localStorage !== 'undefined' ? localStorage : null, updated)
    } catch { /* ignore */ }

    if (isPresetActive(presetKey, selectedTag, customPresets)) {
      setSelectedTag('all')
    }

    if (onFlash) onFlash(`Preset "${label}" dihapus`)
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [customPresets, selectedTag, onFlash])

  const toggleTagMode = useCallback(() => {
    setTagMode((prev) => (prev === 'any' ? 'all' : 'any'))
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [])

  const handleDivisionClick = useCallback((divKey, e) => {
    const isMulti = Boolean(e && (e.shiftKey || e.ctrlKey || e.metaKey))
    setDivision((prev) => toggleDivisionInFilter(divKey, prev, { multi: isMulti, customPresets: customDivPresets }))
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [customDivPresets])

  const handleDivPresetClick = useCallback((presetKey) => {
    setDivision((prev) => {
      if (isDivisionPresetActive(presetKey, prev, customDivPresets)) {
        return 'all'
      }
      const p = getDivisionPreset(presetKey, customDivPresets)
      return p ? p.key : 'all'
    })
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [customDivPresets])

  const handleOpenDivPresetCreator = useCallback(() => {
    setShowDivPresetCreator((prev) => {
      const next = !prev
      if (next) {
        const norm = normalizeDivisionList(division, customDivPresets).filter((d) => d !== 'all')
        setDivPresetFormDivisions(norm.length > 0 ? norm : ['core-be', 'fe-design'])
      }
      return next
    })
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [division, customDivPresets])

  const handleSaveCustomDivPreset = useCallback((e) => {
    if (e && e.preventDefault) e.preventDefault()
    const name = divPresetFormName.trim()
    if (!name || divPresetFormDivisions.length === 0) return

    const newPreset = createCustomDivPreset({
      label: name,
      divisions: divPresetFormDivisions,
      icon: divPresetFormIcon,
      color: divPresetFormColor,
    }, customDivPresets)

    if (!newPreset) return

    const updated = [...customDivPresets, newPreset]
    setCustomDivPresets(updated)
    try {
      saveCustomDivPresets(typeof localStorage !== 'undefined' ? localStorage : null, updated)
    } catch { /* ignore */ }

    setDivision(newPreset.key)
    setShowDivPresetCreator(false)
    setDivPresetFormName('')
    if (onFlash) onFlash(`Preset divisi kustom "${newPreset.label}" berhasil disimpan`)
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [divPresetFormName, divPresetFormDivisions, divPresetFormIcon, divPresetFormColor, customDivPresets, onFlash])

  const handleDeleteCustomDivPreset = useCallback((presetKey, e) => {
    if (e && e.stopPropagation) e.stopPropagation()
    const found = customDivPresets.find(p => p.key === presetKey)
    const label = found?.label || presetKey

    const updated = deleteCustomDivPreset(presetKey, customDivPresets)
    setCustomDivPresets(updated)
    try {
      saveCustomDivPresets(typeof localStorage !== 'undefined' ? localStorage : null, updated)
    } catch { /* ignore */ }

    if (isDivisionPresetActive(presetKey, division, customDivPresets) || division === presetKey) {
      setDivision('all')
    }

    if (onFlash) onFlash(`Preset divisi "${label}" dihapus`)
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [customDivPresets, division, onFlash])

  const load = useCallback(async (signal) => {
    try {
      const d = await api('tasks', { signal })
      setTasks(d.tasks || [])
      // refresh detail yang sedang terbuka agar status/files selalu terbaru
      setSel(s => (s ? (d.tasks || []).find(t => String(t.id) === String(s.id)) || s : s))
      setErr(false)
    }
    catch (e) { if (e.name !== 'AbortError') setErr(true) }
  }, [])

  useEffect(() => {
    const handleOpen = (e) => {
      setOpen(true)
      if (e?.detail?.view) setViewMode(e.detail.view)
      if (e?.detail?.filter) setFilter(e.detail.filter)
      if (e?.detail?.divPreset) {
        const dp = getDivisionPreset(e.detail.divPreset, customDivPresets)
        if (dp) setDivision(dp.key)
      } else if (e?.detail?.division) {
        setDivision(e.detail.division)
      } else if (e?.detail?.role) {
        setDivision(e.detail.role)
      }
      if (e?.detail?.preset) {
        const p = getTagPreset(e.detail.preset, customPresets)
        if (p) setSelectedTag(p.tags)
      } else if (e?.detail?.tag) {
        setSelectedTag(e.detail.tag)
      }
      if (e?.detail?.tagMode) setTagMode(e.detail.tagMode)
      if (e?.detail?.dateRange) setDateRange(e.detail.dateRange)
      if (e?.detail?.customStartDate) setCustomStartDate(e.detail.customStartDate)
      if (e?.detail?.customEndDate) setCustomEndDate(e.detail.customEndDate)
      if (e?.detail?.customRange) {
        const cr = e.detail.customRange
        if (cr.start || cr.startDate) setCustomStartDate(cr.start || cr.startDate)
        if (cr.end || cr.endDate) setCustomEndDate(cr.end || cr.endDate)
      }
      if (e?.detail?.sortBy) setSortBy(e.detail.sortBy)
      if (e?.detail?.taskId && tasks) {
        const found = tasks.find(t => String(t.id) === String(e.detail.taskId))
        if (found) setSel(found)
      }
    }
    window.addEventListener('wfs-open-task-board', handleOpen)
    return () => window.removeEventListener('wfs-open-task-board', handleOpen)
  }, [tasks, customPresets, customDivPresets])

  useEffect(() => {
    const handleToggle = () => {
      setOpen(prev => {
        if (prev) {
          setSel(null)
          return false
        }
        return true
      })
    }
    window.addEventListener('wfs-toggle-task-board', handleToggle)
    return () => window.removeEventListener('wfs-toggle-task-board', handleToggle)
  }, [])

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    const t0 = setTimeout(() => load(ac.signal), 0)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(ac.signal) }, 8000)
    const k = e => {
      if (e.key === 'Escape') {
        if (showDivPresetCreator) {
          setShowDivPresetCreator(false)
        } else if (showPresetCreator) {
          setShowPresetCreator(false)
        } else if (q && document.activeElement === searchInputRef.current) {
          setQ('')
        } else if (sel) {
          setSel(null)
        } else {
          setOpen(false)
        }
      }
    }
    document.addEventListener('keydown', k)
    return () => { ac.abort(); clearTimeout(t0); clearInterval(iv); document.removeEventListener('keydown', k) }
  }, [open, load, sel, q, showPresetCreator, showDivPresetCreator])

  // Fokus ke panel detail saat task dibuka: tombol task yang diklik unmount,
  // tanpa ini fokus jatuh ke <body> — Tab/screen reader mulai lagi dari awal dokumen.
  useEffect(() => {
    if (!open || !sel) return
    const t = setTimeout(() => {
      const h = board.current && board.current.querySelector('h3')
      if (h && !h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1')
      if (h) h.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [open, sel])

  const run = async (t) => {
    try {
      await api(`tasks/${t.id}/run`, { method: 'POST', body: {} })
      onFlash(`Task #${t.id} dijalankan`); load()
    } catch (e) { onFlash(e.message || 'Gagal menjalankan task', true) }
  }
  const ask = (t) => onAsk({ title: `Jalankan task #${t.id}?`, body: `"${t.title}" akan dikerjakan oleh ${t.agent_id} dan memanggil model AI (memakai kuota API).`, ok: 'Jalankan', onOk: () => run(t) })

  const handleMoveTask = useCallback((task, targetColKey) => {
    if (!task || !targetColKey) return
    const curCol = getKanbanColumnKey(task.status)
    if (curCol === targetColKey) return
    const targetCol = KANBAN_COLUMNS.find(c => c.key === targetColKey)
    const targetLabel = targetCol?.label || targetColKey

    setTasks(prev => moveTaskToColumn(prev, task.id, targetColKey))
    setSel(s => (s && String(s.id) === String(task.id) ? { ...s, status: targetColKey } : s))

    if (onFlash) onFlash(formatDragDropNotification(task, targetColKey, targetLabel))

    // Audio feedback interaktif
    if (typeof window !== 'undefined' && window.__officeSound) {
      if (targetColKey === 'done') {
        window.__officeSound.playTaskDone?.()
      } else if (task.priority === 'urgent') {
        window.__officeSound.playTaskUrgent?.()
      } else if (window.__officeSound.playCardDrop) {
        window.__officeSound.playCardDrop()
      } else {
        window.__officeSound.playSelect?.()
      }
    }
  }, [onFlash])

  const handleDragStart = useCallback((e, t) => {
    if (!t) return
    setDraggedTaskId(t.id)
    if (e.dataTransfer) {
      setupCardDragData(e.dataTransfer, t)
    }
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playCardPickup?.()
    }
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedTaskId(null)
    setDragOverCol(null)
  }, [])

  const handleDragOver = useCallback((e, colKey) => {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
    setDragOverCol(prev => (prev === colKey ? prev : colKey))
  }, [])

  const handleDragLeave = useCallback((e, colKey) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDragOverCol(prev => (prev === colKey ? null : prev))
  }, [])

  const handleDrop = useCallback((e, targetColKey) => {
    e.preventDefault()
    let taskId = null
    if (e.dataTransfer) {
      taskId = e.dataTransfer.getData('text/plain')
    }
    if (!taskId) taskId = draggedTaskId
    setDraggedTaskId(null)
    setDragOverCol(null)
    if (!taskId || !tasks) return
    const task = tasks.find(t => String(t.id) === String(taskId))
    if (task && canDropTaskInColumn(task, targetColKey)) {
      handleMoveTask(task, targetColKey)
    }
  }, [draggedTaskId, tasks, handleMoveTask])

  const divisions = useMemo(() => extractTaskDivisions(tasks), [tasks])
  const allDivPresets = useMemo(() => getAllDivisionPresets(customDivPresets), [customDivPresets])
  const activeDivList = useMemo(() => normalizeDivisionList(division, customDivPresets), [division, customDivPresets])
  const isDivAll = !division || division === 'all' || (Array.isArray(division) && division.includes('all'))
  const isMultiDiv = activeDivList.length > 1 && !activeDivList.includes('all')
  const activeDivision = useMemo(() => {
    if (isDivAll) return null
    if (activeDivList.length === 1) {
      return divisions.find(d => d.key === activeDivList[0]) || null
    }
    return null
  }, [divisions, isDivAll, activeDivList])
  const divisionSummary = useMemo(() => formatDivisionFilterSummary(division, customDivPresets), [division, customDivPresets])
  const divPresetStats = useMemo(() => computeDivisionPresetStats(tasks, allDivPresets, customDivPresets), [tasks, allDivPresets, customDivPresets])

  const tagCloud = useMemo(() => computeTagCloud(tasks, { divisionFilter: division, customDivPresets }), [tasks, division, customDivPresets])
  const allPresets = useMemo(() => getAllPresets(customPresets), [customPresets])
  const presetStats = useMemo(() => computePresetStats(tasks, allPresets, division, customDivPresets), [tasks, allPresets, division, customDivPresets])
  const selectableTags = useMemo(() => {
    const map = new Map()
    tagCloud.forEach(t => map.set(t.tag, t.label))
    presetFormTags.forEach(t => {
      if (!map.has(t)) map.set(t, t)
    })
    return Array.from(map.entries()).map(([tag, label]) => ({ tag, label }))
  }, [tagCloud, presetFormTags])
  const customRange = useMemo(() => {
    if (dateRange !== 'custom') return null
    return { start: customStartDate || null, end: customEndDate || null }
  }, [dateRange, customStartDate, customEndDate])

  const customRangeNorm = useMemo(() => {
    return normalizeCustomDateRange(customRange)
  }, [customRange])

  const dateStats = useMemo(() => computeDateRangeStats(tasks, { customRange }), [tasks, customRange])
  const kanbanGroups = useMemo(
    () => groupTasksByKanbanColumn(tasks, q, division, sortBy, selectedTag, tagMode, dateRange, undefined, customRange, customDivPresets),
    [tasks, q, division, sortBy, selectedTag, tagMode, dateRange, customRange, customDivPresets]
  )
  const totalKanbanTasks = useMemo(() => {
    return Object.values(kanbanGroups).reduce((acc, grp) => acc + grp.length, 0)
  }, [kanbanGroups])
  const metrics = useMemo(() => computeSprintMetrics(tasks, division, customDivPresets), [tasks, division, customDivPresets])
  const overallMetrics = useMemo(() => computeSprintMetrics(tasks), [tasks])
  const priorityBreakdown = useMemo(() => computePriorityBreakdown(tasks, division, customDivPresets), [tasks, division, customDivPresets])
  const searchStats = useMemo(
    () => calcSearchStats(tasks, q, { division, tag: selectedTag, tagMode }),
    [tasks, q, division, selectedTag, tagMode]
  )

  const list = useMemo(
    () => filterTasks(tasks, { filter, q, division, sortBy, tag: selectedTag, tagMode, dateRange, customRange, customDivPresets }),
    [tasks, filter, q, division, sortBy, selectedTag, tagMode, dateRange, customRange, customDivPresets]
  )
  const count = s => (tasks || []).filter(t => (s === 'all' || t.status === s) && (isDivAll || matchTaskDivision(t, division, customDivPresets))).length

  const exportableTasks = useMemo(() => {
    if (!tasks) return []
    if (viewMode === 'list') {
      return list
    }
    return filterTasks(tasks, {
      filter: 'all',
      q,
      division,
      sortBy,
      tag: selectedTag,
      tagMode,
      dateRange,
      customRange,
    })
  }, [tasks, viewMode, list, q, division, sortBy, selectedTag, tagMode, dateRange, customRange])

  const handleExport = useCallback((format) => {
    if (!tasks || exportableTasks.length === 0) {
      if (onFlash) onFlash('Tidak ada task untuk diekspor', true)
      return
    }
    const res = exportTasks(exportableTasks, {
      format,
      division,
      filter: viewMode === 'list' ? filter : 'all',
      tag: selectedTag,
      tagMode,
      dateRange,
      customRange,
      q,
      sortBy,
    })
    if (onFlash) {
      onFlash(`${res.count} task diekspor ke ${format.toUpperCase()}`)
    }
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [tasks, exportableTasks, viewMode, division, filter, selectedTag, tagMode, dateRange, customRange, q, sortBy, onFlash])

  return (
    <>
      <button className="ibtn" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="task-board" aria-label="Papan task" title="Papan task (Kanban) — shortcut T">
        <span className="ic"><IconBoard size={19} /><span className="sr-only">📋</span></span>
        <span className="lb">Papan</span>
      </button>
      {open && (
        <section ref={board} id="task-board" className={`panel left${viewMode === 'kanban' && !sel ? ' wide-kanban' : ''}`} role="dialog" aria-label="Papan task" aria-modal="true">
          <div className="ph">
            <div className="t">
              Papan Task
              <small>
                {tasks ? (
                  !isDivAll ? (
                    `${metrics.total}/${overallMetrics.total} task (${activeDivision?.label || divisionSummary}) · ${metrics.done}/${metrics.total} (${metrics.pct}%) selesai${metrics.running ? ` · ● ${metrics.running} jalan` : ''}`
                  ) : (
                    `${tasks.length} task · ${metrics.done}/${metrics.total} (${metrics.pct}%) selesai${metrics.running ? ` · ● ${metrics.running} jalan` : ''}`
                  )
                ) : 'memuat…'}
              </small>
            </div>
            {!sel && tasks && tasks.length > 0 && (
              <div className="task-export-group" role="group" aria-label="Ekspor task">
                <button
                  type="button"
                  className="task-export-btn"
                  onClick={() => handleExport('csv')}
                  title={`Ekspor ${exportableTasks.length} task ke CSV (Excel / Spreadsheet)`}
                  aria-label={`Ekspor ${exportableTasks.length} task ke CSV`}
                >
                  <IconDownload size={13} />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  className="task-export-btn"
                  onClick={() => handleExport('json')}
                  title={`Ekspor ${exportableTasks.length} task lengkap ke format JSON`}
                  aria-label={`Ekspor ${exportableTasks.length} task ke JSON`}
                >
                  <IconDownload size={13} />
                  <span>JSON</span>
                </button>
              </div>
            )}
            {!sel && (
              <div className="view-switch" role="group" aria-label="Mode tampilan task">
                <button
                  type="button"
                  className={'v-btn' + (viewMode === 'list' ? ' active' : '')}
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  title="Tampilan Daftar (List)"
                  aria-label="Tampilan Daftar"
                >
                  <IconList size={14} />
                  <span>Daftar</span>
                </button>
                <button
                  type="button"
                  className={'v-btn' + (viewMode === 'kanban' ? ' active' : '')}
                  onClick={() => setViewMode('kanban')}
                  aria-pressed={viewMode === 'kanban'}
                  title="Tampilan Papan Kolom (Kanban)"
                  aria-label="Tampilan Papan Kolom"
                >
                  <IconKanban size={14} />
                  <span>Kanban</span>
                </button>
              </div>
            )}
            <button className="x" onClick={() => setOpen(false)} aria-label="Tutup papan task" title="Tutup papan task (Esc)">
              <IconClose size={18} />
              <span className="sr-only">✕</span>
            </button>
          </div>
          {/* Sprint Progress Bar (Visual Progress) */}
          {tasks && (
            <div
              className="sprint-progress-container"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={metrics.pct}
              aria-label={`Progres sprint ${!isDivAll ? (activeDivision?.fullName || divisionSummary) : 'kampus'}: ${metrics.pct}% selesai`}
              title={`Progres sprint: ${metrics.done}/${metrics.total} task (${metrics.pct}%) selesai`}
            >
              <div
                className="sprint-progress-fill"
                style={{
                  width: `${metrics.pct}%`,
                  background: !isDivAll && (activeDivision?.color || '#38BDF8')
                    ? `linear-gradient(90deg, ${activeDivision?.color || '#38BDF8'}, #448AFF)`
                    : 'linear-gradient(90deg, #10E5A0, #448AFF)',
                }}
              />
            </div>
          )}
          {sel ? (
            <div style={{ padding: 14, overflowY: 'auto' }}>
              <button className="btn" onClick={() => {
                if (typeof window !== 'undefined' && window.__officeSound) {
                  window.__officeSound.playSelect?.()
                }
                setSel(null)
              }} style={{ marginBottom: 10 }}>← Kembali</button>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>#{sel.id} {sel.title}</h3>
              <p className="note" style={{ marginBottom: 8 }}>
                Agent: {sel.agent_id || '—'} · Role: {sel.role || '—'} ({getTaskRoleLabel(sel.role)}) · Prioritas: <b style={{ color: getTaskPriorityInfo(sel.priority).color }}>{getTaskPriorityInfo(sel.priority).icon} {getTaskPriorityInfo(sel.priority).label}</b> · <b style={{ color: ST[sel.status]?.[1] }}>{ST[sel.status]?.[0] || sel.status}</b>{parseTaskTimestamp(sel) ? <> · Waktu: <b>{formatTaskDate(sel)}</b></> : null}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ minHeight: 28, padding: '0 8px', fontSize: 11 }}
                  onClick={() => {
                    const team = findTeamByRole(sel.role) || findTeamByAgent(sel.agent_id)
                    if (team) setDivision(team.key)
                    setSel(null)
                  }}
                  title="Filter Kanban berdasarkan divisi task ini"
                >
                  🔍 Filter Divisi {(findTeamByRole(sel.role) || findTeamByAgent(sel.agent_id))?.shortName || 'Terkait'}
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ minHeight: 28, padding: '0 8px', fontSize: 11 }}
                  onClick={() => {
                    const team = findTeamByRole(sel.role) || findTeamByAgent(sel.agent_id)
                    if (team && typeof window !== 'undefined' && window.__focusTeam) {
                      window.__focusTeam(team.key)
                    }
                  }}
                  title="Fokus kamera 3D ke pod tim pelaksana task ini"
                >
                  🎯 Fokus Pod Tim 3D ↗
                </button>
                {sel.agent_id && (
                  <button
                    type="button"
                    className="btn"
                    style={{ minHeight: 28, padding: '0 8px', fontSize: 11 }}
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.__focusAgent) {
                        window.__focusAgent(sel.agent_id)
                      } else if (typeof window !== 'undefined' && window.__wfsSceneSelect) {
                        window.__wfsSceneSelect(sel.agent_id)
                      }
                    }}
                    title={`Fokus kamera 3D langsung ke meja agen ${sel.agent_id}`}
                  >
                    🎯 Fokus Agen ({sel.agent_id}) ↗
                  </button>
                )}
              </div>
              {(() => { const fl = parseFileList(sel.files); return fl.length > 0 && <><label className="note">File dihasilkan</label><pre className="note" style={{ whiteSpace: 'pre-wrap', margin: '4px 0 10px', color: '#cfd8e3' }}>{fl.join('\n')}</pre></> })()}
              {sel.review && <><label className="note">Ulasan QA</label><div className="msg" style={{ maxWidth: '100%', marginTop: 4, fontSize: 13 }}>{sel.review}</div></>}
              {(() => {
                const selBadges = getTaskCardBadges(sel)
                return selBadges.tags.length > 0 ? (
                  <div style={{ margin: '8px 0 10px' }}>
                    <label className="note" style={{ display: 'block', marginBottom: 4 }}>Tag & Kategori</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {selBadges.tags.map((tg) => {
                        const isChipAct = activeTags.includes(tg.tag)
                        return (
                          <button
                            key={tg.tag}
                            type="button"
                            className={`task-detail-tag-chip${isChipAct ? ' active' : ''}`}
                            style={{ '--tag-color': tg.color }}
                            onClick={(e) => {
                              handleTagClick(tg.tag, e)
                              setSel(null)
                            }}
                            title={`Lihat semua task dengan tag #${tg.label}`}
                            aria-label={`Filter tag #${tg.label}`}
                          >
                            #{tg.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null
              })()}
              <div className="kanban-quick-move-strip" role="group" aria-label="Pindahkan kolom task">
                <span className="kanban-quick-move-label">Pindah Kolom:</span>
                {KANBAN_COLUMNS.map(col => {
                  const isCurrent = getKanbanColumnKey(sel.status) === col.key
                  const canMove = canMoveTaskToColumn(sel, col.key)
                  return (
                    <button
                      key={col.key}
                      type="button"
                      className={'kanban-move-btn' + (isCurrent ? ' current' : '')}
                      style={{ '--btn-accent': col.color }}
                      disabled={!canMove}
                      onClick={() => handleMoveTask(sel, col.key)}
                      title={isCurrent ? `Saat ini di kolom ${col.label}` : `Pindahkan task ke kolom ${col.label}`}
                      aria-label={`Pindahkan task #${sel.id} ke kolom ${col.label}`}
                    >
                      <span aria-hidden="true">{col.icon}</span>
                      <span>{col.label}</span>
                    </button>
                  )
                })}
              </div>
              {sel.status !== 'running' && sel.status !== 'done' && (
                <button className="btn primary" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => ask(sel)}>
                  <IconPlay size={14} />
                  <span>Jalankan task</span>
                </button>
              )}
              {sel.status === 'done' && (
                <button className="btn" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => ask(sel)}>
                  <IconRotate size={14} />
                  <span>Jalankan ulang</span>
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 12px 0' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <div className="task-search-bar" style={{ flex: 1, position: 'relative' }}>
                    <span className="task-search-icon" aria-hidden="true">
                      <IconSearch size={14} />
                    </span>
                    <input
                      ref={searchInputRef}
                      className="fld task-search-input"
                      style={{ width: '100%', margin: 0, paddingRight: q ? 74 : 10 }}
                      aria-label="Cari task"
                      placeholder="Cari judul, agent, role, prioritas, #tag… (/)"
                      value={q}
                      onChange={e => setQ(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Escape' && q) {
                          e.stopPropagation()
                          setQ('')
                        }
                      }}
                    />
                    {q && (
                      <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 2 }}>
                        <span
                          className="task-search-count-badge"
                          aria-live="polite"
                          title={`Ditemukan ${searchStats.matched} task dari total ${searchStats.total} task`}
                        >
                          {searchStats.matched}/{searchStats.total}
                        </span>
                        <button
                          type="button"
                          className="task-search-clear-btn"
                          onClick={() => {
                            setQ('')
                            searchInputRef.current?.focus()
                            if (typeof window !== 'undefined' && window.__officeSound) {
                              window.__officeSound.playSelect?.()
                            }
                          }}
                          aria-label="Hapus kata kunci pencarian"
                          title="Hapus pencarian (Esc)"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="task-date-container">
                    <label htmlFor="task-date-select" className="sr-only">Rentang waktu task:</label>
                    <div className="task-date-wrapper">
                      <span className="task-date-icon" aria-hidden="true">
                        <IconCalendar size={13} />
                      </span>
                      <select
                        id="task-date-select"
                        className={`task-date-select${dateRange !== 'all' ? ' active' : ''}`}
                        value={dateRange}
                        onChange={e => {
                          setDateRange(e.target.value)
                          if (typeof window !== 'undefined' && window.__officeSound) {
                            window.__officeSound.playSelect?.()
                          }
                        }}
                        aria-label="Rentang waktu task"
                        title={formatDateRangeSummary(dateRange, dateStats[dateRange] ?? 0, { customRange })}
                      >
                        {DATE_RANGE_PRESETS.map(opt => (
                          <option key={opt.key} value={opt.key}>
                            {opt.icon} {opt.shortLabel} ({dateStats[opt.key] ?? 0})
                          </option>
                        ))}
                      </select>
                      {dateRange !== 'all' && (
                        <button
                          type="button"
                          className="task-date-clear-btn"
                          onClick={() => {
                            setDateRange('all')
                            setCustomStartDate('')
                            setCustomEndDate('')
                            if (typeof window !== 'undefined' && window.__officeSound) {
                              window.__officeSound.playSelect?.()
                            }
                          }}
                          aria-label="Reset rentang waktu ke semua"
                          title="Reset filter tanggal"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="task-sort-container">
                    <label htmlFor="task-sort-select" className="sr-only">Urutkan task:</label>
                    <select
                      id="task-sort-select"
                      className="task-sort-select"
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                      aria-label="Urutkan task"
                      title="Urutan task"
                    >
                      {SORT_OPTIONS.map(opt => (
                        <option key={opt.key} value={opt.key}>
                          {opt.icon} {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {priorityBreakdown.urgent > 0 && (
                    <button
                      type="button"
                      className={`task-priority-quick-btn urgent${sortBy === 'priority' ? ' active' : ''}`}
                      onClick={() => {
                        const nextSort = sortBy === 'priority' ? 'newest' : 'priority'
                        setSortBy(nextSort)
                        if (nextSort === 'priority' && typeof window !== 'undefined' && window.__officeSound) {
                          window.__officeSound.playTaskUrgent?.()
                        }
                      }}
                      title={`Terdapat ${priorityBreakdown.urgent} task urgent — klik untuk ${sortBy === 'priority' ? 'kembalikan ke urutan terbaru' : 'urutkan prioritas ke atas'}`}
                      aria-pressed={sortBy === 'priority'}
                      aria-label={`Filter prioritas urgent (${priorityBreakdown.urgent} task)`}
                    >
                      🔥 {priorityBreakdown.urgent}
                    </button>
                  )}
                </div>
                {/* Panel Rentang Tanggal Kustom */}
                {dateRange === 'custom' && (
                  <div className="task-custom-date-bar" role="region" aria-label="Pengaturan rentang tanggal kustom">
                    <div className="task-custom-date-inputs">
                      <label htmlFor="task-custom-start" className="task-custom-date-label">Dari:</label>
                      <input
                        id="task-custom-start"
                        type="date"
                        className={`task-date-input${customRangeNorm.isReversed ? ' invalid' : ''}`}
                        value={customStartDate}
                        onChange={e => {
                          setCustomStartDate(e.target.value)
                          if (typeof window !== 'undefined' && window.__officeSound) window.__officeSound.playSelect?.()
                        }}
                        aria-label="Tanggal awal kustom"
                        title="Pilih tanggal awal filter"
                      />
                      <label htmlFor="task-custom-end" className="task-custom-date-label">s/d:</label>
                      <input
                        id="task-custom-end"
                        type="date"
                        className={`task-date-input${customRangeNorm.isReversed ? ' invalid' : ''}`}
                        value={customEndDate}
                        onChange={e => {
                          setCustomEndDate(e.target.value)
                          if (typeof window !== 'undefined' && window.__officeSound) window.__officeSound.playSelect?.()
                        }}
                        aria-label="Tanggal akhir kustom"
                        title="Pilih tanggal akhir filter"
                      />
                      {(customStartDate || customEndDate) && (
                        <button
                          type="button"
                          className="task-custom-date-reset-btn"
                          onClick={() => {
                            setCustomStartDate('')
                            setCustomEndDate('')
                            if (typeof window !== 'undefined' && window.__officeSound) window.__officeSound.playSelect?.()
                          }}
                          title="Kosongkan tanggal kustom"
                          aria-label="Kosongkan tanggal kustom"
                        >
                          ✕ Kosongkan
                        </button>
                      )}
                    </div>
                    <div className="task-custom-date-info">
                      {customRangeNorm.isReversed ? (
                        <span className="task-custom-date-error" role="alert">
                          ⚠️ Tanggal awal tidak boleh melebihi tanggal akhir
                        </span>
                      ) : (
                        <span className="task-custom-date-summary">
                          {formatCustomDateRange(customRange)}
                          {dateStats.custom != null ? ` · ${dateStats.custom} task cocok` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {/* Strip Filter Divisi / Tim Kampus */}
                {tasks && (
                  <div className="division-filter-strip" role="group" aria-label="Filter berdasarkan divisi kerja">
                    {divisions.map((div) => {
                      const isActive = div.key === 'all'
                        ? isDivAll
                        : (!isDivAll && activeDivList.includes(div.key))
                      return (
                        <button
                          key={div.key}
                          type="button"
                          className={'div-chip' + (isActive ? ' active' : '')}
                          onClick={(e) => handleDivisionClick(div.key, e)}
                          aria-pressed={isActive}
                          aria-label={div.key === 'all' ? 'Tampilkan semua divisi' : `Filter divisi ${div.fullName || div.label}`}
                          title={div.key === 'all' ? 'Tampilkan semua divisi' : `Filter ${div.fullName || div.label}: ${div.count} task (${div.done || 0} selesai)`}
                        >
                          <span className="div-chip-dot" style={{ background: div.color }} aria-hidden="true" />
                          <span className="div-chip-label">{div.label}</span>
                          <span className="div-chip-count">
                            {div.count}
                          </span>
                        </button>
                      )
                    })}
                    {!isDivAll && (
                      <button
                        type="button"
                        className="div-chip-focus-btn"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            if (activeDivList.length === 1 && window.__focusTeam) {
                              window.__focusTeam(activeDivList[0])
                            } else if (window.__resetFocus) {
                              window.__resetFocus()
                            } else if (window.__cam && window.__cam.reset) {
                              window.__cam.reset()
                            }
                          }
                        }}
                        title={activeDivList.length === 1 ? `Fokus kamera 3D ke pod ${activeDivision?.fullName || activeDivList[0]}` : 'Fokus kamera 3D ke gambaran kampus'}
                        aria-label={activeDivList.length === 1 ? `Fokus kamera 3D ke pod ${activeDivision?.fullName || activeDivList[0]}` : 'Fokus kamera 3D ke gambaran kampus'}
                      >
                        <span>{activeDivList.length === 1 ? 'Fokus Pod 3D ↗' : 'Fokus Kampus 3D ↗'}</span>
                      </button>
                    )}
                  </div>
                )}
                {/* Strip Preset Kombinasi Divisi */}
                {tasks && (
                  <div className="div-preset-strip" role="group" aria-label="Preset kombinasi divisi">
                    <span className="div-preset-strip-label">Preset Divisi:</span>
                    {allDivPresets.map((preset) => {
                      const isPresetOn = isDivisionPresetActive(preset.key, division, customDivPresets)
                      const stat = divPresetStats.find((s) => s.key === preset.key)
                      const count = stat ? stat.count : 0
                      return (
                        <div
                          key={preset.key}
                          className={`div-preset-chip${isPresetOn ? ' active' : ''}${preset.isCustom ? ' is-custom' : ''}`}
                          style={{ '--preset-color': preset.color }}
                        >
                          <button
                            type="button"
                            className="div-preset-chip-main"
                            onClick={() => handleDivPresetClick(preset.key)}
                            aria-pressed={isPresetOn}
                            title={preset.desc || preset.label}
                            aria-label={`Preset ${preset.label}: ${count} task`}
                          >
                            <span className="div-preset-icon">{preset.icon}</span>
                            <span className="div-preset-label">{preset.label}</span>
                            <span className="div-preset-count">{count}</span>
                          </button>
                          {preset.isCustom && (
                            <button
                              type="button"
                              className="div-preset-del-btn"
                              onClick={(e) => handleDeleteCustomDivPreset(preset.key, e)}
                              title={`Hapus preset kustom ${preset.label}`}
                              aria-label={`Hapus preset kustom ${preset.label}`}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )
                    })}
                    <button
                      type="button"
                      className={`div-preset-add-btn${showDivPresetCreator ? ' active' : ''}`}
                      onClick={handleOpenDivPresetCreator}
                      title="Buat preset kombinasi divisi baru"
                      aria-label="Buat preset divisi baru"
                    >
                      <span>+ {isMultiDiv ? `Simpan (${activeDivList.length} Divisi)` : 'Preset Baru'}</span>
                    </button>
                  </div>
                )}

                {/* Panel Pembuat Preset Divisi Kustom */}
                {showDivPresetCreator && (
                  <div
                    className="div-preset-creator"
                    role="form"
                    aria-label="Form pembuatan preset divisi kustom"
                  >
                    <div className="div-preset-creator-header">
                      <span>🏢 Buat Preset Divisi Kustom</span>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '0 4px', height: 20, minWidth: 20 }}
                        onClick={() => setShowDivPresetCreator(false)}
                        aria-label="Tutup form preset divisi"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="div-preset-creator-row">
                      <input
                        type="text"
                        className="div-preset-input"
                        placeholder="Nama preset (mis. Mobile Squad, Core Stack…)"
                        value={divPresetFormName}
                        onChange={(e) => setDivPresetFormName(e.target.value)}
                        maxLength={24}
                        autoFocus
                      />

                      <div className="div-preset-icon-picker" role="radiogroup" aria-label="Pilih ikon preset divisi">
                        {DIVISION_PRESET_ICONS.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            className={`div-preset-icon-btn${divPresetFormIcon === icon ? ' active' : ''}`}
                            onClick={() => setDivPresetFormIcon(icon)}
                            aria-label={`Ikon ${icon}`}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>

                      <div className="div-preset-color-picker" role="radiogroup" aria-label="Pilih warna preset divisi">
                        {TAG_PALETTE.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`div-preset-color-btn${divPresetFormColor === c ? ' active' : ''}`}
                            style={{ background: c, '--dot-color': c }}
                            onClick={() => setDivPresetFormColor(c)}
                            aria-label={`Warna ${c}`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="div-preset-divisions-selector" role="group" aria-label="Pilih divisi untuk preset">
                      {TEAMS.map((team) => {
                        const isSelected = divPresetFormDivisions.includes(team.key)
                        return (
                          <button
                            key={team.key}
                            type="button"
                            className={`div-preset-division-toggle${isSelected ? ' selected' : ''}`}
                            onClick={() => {
                              setDivPresetFormDivisions((prev) =>
                                prev.includes(team.key) ? prev.filter((k) => k !== team.key) : [...prev, team.key]
                              )
                            }}
                            aria-pressed={isSelected}
                            aria-label={`Divisi ${team.shortName}`}
                          >
                            <span className="div-selector-dot" style={{ background: team.color }} aria-hidden="true" />
                            <span>{team.shortName}</span>
                            {isSelected && <span aria-hidden="true">✓</span>}
                          </button>
                        )
                      })}
                    </div>

                    <div className="div-preset-creator-actions">
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                        onClick={() => setShowDivPresetCreator(false)}
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ height: 24, padding: '0 10px', fontSize: 11 }}
                        disabled={!divPresetFormName.trim() || divPresetFormDivisions.length === 0}
                        onClick={handleSaveCustomDivPreset}
                      >
                        Simpan Preset
                      </button>
                    </div>
                  </div>
                )}
              {/* Strip Filter Tag Kustom */}
              {tasks && tagCloud.length > 0 && (
                <div
                  className="task-tag-strip"
                  role="group"
                  aria-label="Filter berdasarkan tag task"
                  title={activeTags.length > 0 ? formatTagFilterSummary(selectedTag, tagMode) : undefined}
                >
                  <span className="task-tag-strip-label">Tag:</span>
                  <button
                    type="button"
                    className={`task-tag-chip${activeTags.length === 0 ? ' active' : ''}`}
                    onClick={(e) => handleTagClick('all', e)}
                    aria-pressed={activeTags.length === 0}
                    aria-label="Tampilkan semua tag"
                  >
                    Semua
                  </button>
                  {tagCloud.map((item) => {
                    const isAct = activeTags.includes(item.tag)
                    return (
                      <button
                        key={item.tag}
                        type="button"
                        className={`task-tag-chip${isAct ? ' active' : ''}`}
                        style={{ '--chip-accent': item.color, '--chip-text-color': item.textColor || '#0b1320' }}
                        onClick={(e) => handleTagClick(item.tag, e)}
                        aria-pressed={isAct}
                        title={`Filter task #${item.label} (${item.count} task) — Shift+Klik untuk multi-pilih`}
                        aria-label={`Filter tag ${item.label}: ${item.count} task`}
                      >
                        <span className="task-tag-chip-hash" aria-hidden="true">#</span>
                        <span className="task-tag-chip-name">{item.label}</span>
                        <span className="task-tag-chip-count">{item.count}</span>
                      </button>
                    )
                  })}
                  {activeTags.length > 1 && (
                    <button
                      type="button"
                      className="task-tag-mode-btn"
                      onClick={toggleTagMode}
                      title={tagMode === 'all' ? 'Mode pencocokan: DAN (harus cocok semua tag). Klik untuk ganti ke ATAU' : 'Mode pencocokan: ATAU (cocok salah satu tag). Klik untuk ganti ke DAN'}
                      aria-label={`Ganti mode filter tag (saat ini ${tagMode === 'all' ? 'DAN' : 'ATAU'})`}
                    >
                      {tagMode === 'all' ? 'Mode: DAN' : 'Mode: ATAU'}
                    </button>
                  )}
                  {activeTags.length > 0 && (
                    <button
                      type="button"
                      className="task-tag-clear-btn"
                      onClick={(e) => handleTagClick('all', e)}
                      title="Reset filter tag"
                      aria-label="Reset filter tag"
                    >
                      ✕ Reset{activeTags.length > 1 ? ` (${activeTags.length})` : ''}
                    </button>
                  )}
                </div>
              )}
              {/* Strip Preset Kombinasi Tag */}
              {tasks && (
                <div className="task-preset-strip" role="group" aria-label="Preset kombinasi tag">
                  <span className="task-preset-strip-label">Preset:</span>
                  {presetStats.map((p) => {
                    const isAct = isPresetActive(p.key, selectedTag, customPresets)
                    if (p.isCustom) {
                      return (
                        <div
                          key={p.key}
                          className={`task-preset-chip is-custom${isAct ? ' active' : ''}`}
                          style={{ '--preset-color': p.color }}
                        >
                          <button
                            type="button"
                            className="task-preset-chip-main"
                            onClick={() => handlePresetClick(p.key)}
                            aria-pressed={isAct}
                            title={`${p.label}: [${p.tags.map(t => '#' + t).join(', ')}] — ${p.desc} (${p.count} task)`}
                            aria-label={`Preset ${p.label}: ${p.count} task`}
                          >
                            <span className="task-preset-icon" aria-hidden="true">{p.icon}</span>
                            <span className="task-preset-label">{p.label}</span>
                            {p.count > 0 && <span className="task-preset-count">{p.count}</span>}
                          </button>
                          <button
                            type="button"
                            className="task-preset-del-btn"
                            onClick={(e) => handleDeleteCustomPreset(p.key, e)}
                            title={`Hapus preset kustom ${p.label}`}
                            aria-label={`Hapus preset kustom ${p.label}`}
                          >
                            ✕
                          </button>
                        </div>
                      )
                    }
                    return (
                      <button
                        key={p.key}
                        type="button"
                        className={`task-preset-chip${isAct ? ' active' : ''}`}
                        style={{ '--preset-color': p.color }}
                        onClick={() => handlePresetClick(p.key)}
                        aria-pressed={isAct}
                        title={`${p.label}: [${p.tags.map(t => '#' + t).join(', ')}] — ${p.desc} (${p.count} task)`}
                        aria-label={`Preset ${p.label}: ${p.count} task`}
                      >
                        <span className="task-preset-icon" aria-hidden="true">{p.icon}</span>
                        <span className="task-preset-label">{p.label}</span>
                        {p.count > 0 && <span className="task-preset-count">{p.count}</span>}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    className={`task-preset-add-btn${showPresetCreator ? ' active' : ''}`}
                    onClick={() => {
                      if (!showPresetCreator) {
                        setPresetFormName('')
                        if (activeTags.length > 0) {
                          setPresetFormTags([...activeTags])
                        } else if (tagCloud.length > 0) {
                          setPresetFormTags([tagCloud[0].tag])
                        } else {
                          setPresetFormTags([])
                        }
                      }
                      setShowPresetCreator(prev => !prev)
                      if (typeof window !== 'undefined' && window.__officeSound) {
                        window.__officeSound.playSelect?.()
                      }
                    }}
                    title={activeTags.length > 0 ? `Simpan ${activeTags.length} tag aktif sebagai preset baru` : 'Buat preset kombinasi tag baru'}
                    aria-label="Buat preset tag baru"
                    aria-expanded={showPresetCreator}
                  >
                    <span>{showPresetCreator ? '✕ Tutup' : (activeTags.length > 0 ? `+ Simpan (${activeTags.length} tag)` : '+ Preset Baru')}</span>
                  </button>
                </div>
              )}
              {/* Creator Form Preset Kustom */}
              {tasks && showPresetCreator && (
                <form
                  className="task-preset-creator"
                  onSubmit={handleSaveCustomPreset}
                  aria-label="Form pembuatan preset tag kustom"
                >
                  <div className="task-preset-creator-header">
                    <span>✨ Simpan Preset Tag Kustom</span>
                    <button
                      type="button"
                      className="task-date-clear-btn"
                      onClick={() => setShowPresetCreator(false)}
                      title="Batal / Tutup (Esc)"
                      aria-label="Tutup form preset"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="task-preset-creator-row">
                    <input
                      type="text"
                      className="task-preset-input"
                      placeholder="Nama preset (misal: Cloud & Infra)..."
                      value={presetFormName}
                      onChange={(e) => setPresetFormName(e.target.value)}
                      maxLength={32}
                      aria-label="Nama preset kustom"
                      autoFocus
                    />
                    <div className="task-preset-icon-picker" role="group" aria-label="Pilih ikon preset">
                      {PRESET_ICONS.slice(0, 8).map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          className={`task-preset-icon-btn${presetFormIcon === ic ? ' active' : ''}`}
                          onClick={() => setPresetFormIcon(ic)}
                          aria-label={`Pilih ikon ${ic}`}
                          aria-pressed={presetFormIcon === ic}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                    <div className="task-preset-color-picker" role="group" aria-label="Pilih warna preset">
                      {TAG_PALETTE.slice(0, 6).map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`task-preset-color-btn${presetFormColor === c ? ' active' : ''}`}
                          style={{ background: c, '--dot-color': c }}
                          onClick={() => setPresetFormColor(c)}
                          aria-label={`Pilih warna ${c}`}
                          aria-pressed={presetFormColor === c}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="task-preset-tags-section">
                    <span className="task-tag-strip-label" style={{ marginBottom: 4, display: 'inline-block' }}>
                      Pilih Tag ({presetFormTags.length} dipilih):
                    </span>
                    <div className="task-preset-tags-selector" role="group" aria-label="Pilihan tag untuk preset">
                      {selectableTags.map((item) => {
                        const isSel = presetFormTags.includes(item.tag)
                        return (
                          <button
                            key={item.tag}
                            type="button"
                            className={`task-preset-tag-toggle${isSel ? ' selected' : ''}`}
                            onClick={() => {
                              setPresetFormTags((prev) =>
                                prev.includes(item.tag)
                                  ? prev.filter((t) => t !== item.tag)
                                  : [...prev, item.tag]
                              )
                            }}
                            aria-pressed={isSel}
                            aria-label={`Tag #${item.label}`}
                          >
                            <span>#{item.label}</span>
                            {isSel && <span aria-hidden="true"> ✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="task-preset-creator-actions">
                    <button
                      type="button"
                      className="btn"
                      style={{ minHeight: 28, fontSize: 11 }}
                      onClick={() => setShowPresetCreator(false)}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="btn primary"
                      style={{ minHeight: 28, fontSize: 11 }}
                      disabled={!presetFormName.trim() || presetFormTags.length === 0}
                    >
                      Simpan Preset
                    </button>
                  </div>
                </form>
              )}
                {viewMode === 'list' && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {FILTERS.map(([k, l]) => <button key={k} className={'btn' + (filter === k ? ' primary' : '')} style={{ minHeight: 34, padding: '0 10px', fontSize: 12 }} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} {count(k)}</button>)}
                  </div>
                )}
              </div>
              {err && <div style={{ padding: '0 12px 8px' }}><div className="msg err" role="alert">Gagal memuat task. <button className="btn" onClick={() => load()}>Coba lagi</button></div></div>}
              {!tasks && !err && <div style={{ padding: '0 12px 12px' }}><div className="skeleton" role="status">Memuat task…</div></div>}
              {tasks && <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{`${list.length} task ditampilkan`}</div>}
              {tasks && list.length === 0 && <div style={{ padding: '0 12px 12px' }}><div className="skeleton">Tidak ada task yang cocok.</div></div>}

              {viewMode === 'kanban' && tasks && (
                totalKanbanTasks === 0 && q.trim() ? (
                  <div className="kanban-empty-board-banner" role="status">
                    <span className="kanban-empty-board-icon" aria-hidden="true">🔍</span>
                    <div className="kanban-empty-board-title">
                      Tidak ada task yang cocok dengan &ldquo;{q}&rdquo;
                    </div>
                    <div className="kanban-empty-board-sub">
                      Periksa kata kunci pencarian atau sesuaikan filter divisi dan tag aktif.
                    </div>
                    <button
                      type="button"
                      className="btn primary"
                      style={{ marginTop: 10, fontSize: 12, minHeight: 30 }}
                      onClick={() => {
                        setQ('')
                        searchInputRef.current?.focus()
                        if (typeof window !== 'undefined' && window.__officeSound) {
                          window.__officeSound.playSelect?.()
                        }
                      }}
                    >
                      ✕ Bersihkan Pencarian
                    </button>
                  </div>
                ) : (
                  <div className="kanban-board-container" role="region" aria-label="Papan kanban sprint">
                    {KANBAN_COLUMNS.map(col => {
                      const colTasks = kanbanGroups[col.key] || []
                      const dist = computeColumnDistribution(colTasks.length, metrics.total)
                      const emptyState = getKanbanColumnSearchEmptyState(col.key, {
                        isSearching: Boolean(q.trim()),
                        columnLabel: col.label,
                      })
                      return (
                      <div
                        key={col.key}
                        className={`kanban-col${dragOverCol === col.key ? ' drag-over' : ''}`}
                        role="region"
                        aria-label={`Kolom ${col.label}`}
                        style={{ '--col-color': col.color }}
                        onDragOver={(e) => handleDragOver(e, col.key)}
                        onDragLeave={(e) => handleDragLeave(e, col.key)}
                        onDrop={(e) => handleDrop(e, col.key)}
                      >
                        <div className="kanban-col-head" style={{ borderTop: `3px solid ${col.color}` }}>
                          <span className="kanban-col-icon" aria-hidden="true">{col.icon}</span>
                          <span className="kanban-col-title">{col.label}</span>
                          <span className="kanban-col-count" style={{ background: col.bg, color: col.color }}>{colTasks.length}</span>
                        </div>
                        <div
                          className="kanban-col-dist-bar"
                          role="progressbar"
                          aria-label={`Distribusi kolom ${col.label}: ${dist.pct}%`}
                          aria-valuenow={dist.pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          title={`${dist.count}/${dist.total} task (${dist.pct}%) di kolom ${col.label}`}
                        >
                          <div
                            className="kanban-col-dist-fill"
                            style={{ width: `${dist.widthPct}%`, background: col.color }}
                          />
                        </div>
                        <div className="kanban-col-body">
                          {colTasks.length === 0 ? (
                            <div className="kanban-col-empty">
                              <span className="kanban-col-empty-icon" aria-hidden="true">{emptyState.icon}</span>
                              <span>{emptyState.text}</span>
                            </div>
                          ) : (
                            colTasks.map((t, idx) => {
                              const badges = getTaskCardBadges(t)
                              const isDragging = draggedTaskId === t.id
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  className={`kanban-card${isDragging ? ' is-dragging' : ''}`}
                                  data-dragging={isDragging ? 'true' : undefined}
                                  draggable={true}
                                  onDragStart={(e) => handleDragStart(e, t)}
                                  onDragEnd={handleDragEnd}
                                  onClick={() => {
                                    if (t.priority === 'urgent' && typeof window !== 'undefined' && window.__officeSound) {
                                      window.__officeSound.playTaskUrgent?.()
                                    } else if (typeof window !== 'undefined' && window.__officeSound) {
                                      window.__officeSound.playSelect?.()
                                    }
                                    setSel(t)
                                  }}
                                  style={{
                                    borderLeft: `3px solid ${ST[t.status]?.[1] || col.color}`,
                                    animationDelay: `${Math.min(idx * 30, 240)}ms`,
                                  }}
                                  aria-label={`Task #${t.id}: ${t.title}`}
                                  title={`Buka task #${t.id}: ${t.title} (geser untuk pindah kolom)`}
                                >
                                  <div className="kanban-card-top">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <span className="kanban-card-id">#{t.id}</span>
                                      {t.priority && badges.priority.key !== 'normal' && (
                                        <span
                                          className="kanban-priority-badge"
                                          style={{ color: badges.priority.color, background: badges.priority.bg }}
                                          title={`Prioritas: ${badges.priority.label}`}
                                        >
                                          <span aria-hidden="true">{badges.priority.icon}</span>
                                          <span>{badges.priority.label}</span>
                                        </span>
                                      )}
                                    </div>
                                    {t.agent_id && (
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        className="kanban-card-agent-btn"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (typeof window !== 'undefined' && window.__focusAgent) {
                                            window.__focusAgent(t.agent_id)
                                          } else if (typeof window !== 'undefined' && window.__wfsSceneSelect) {
                                            window.__wfsSceneSelect(t.agent_id)
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.stopPropagation()
                                            e.preventDefault()
                                            if (typeof window !== 'undefined' && window.__focusAgent) {
                                              window.__focusAgent(t.agent_id)
                                            } else if (typeof window !== 'undefined' && window.__wfsSceneSelect) {
                                              window.__wfsSceneSelect(t.agent_id)
                                            }
                                          }
                                        }}
                                        title={`Fokus kamera 3D ke meja agen ${t.agent_id}`}
                                        aria-label={`Fokus kamera 3D ke agen ${t.agent_id}`}
                                      >
                                        <span aria-hidden="true">🎯</span>
                                        <span>{t.agent_id}</span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="kanban-card-title">
                                    {getSearchMatchSegments(t.title, q).map((seg, i) =>
                                      seg.match ? (
                                        <mark key={i} className="kanban-search-highlight">
                                          {seg.text}
                                        </mark>
                                      ) : (
                                        seg.text
                                      )
                                    )}
                                  </div>
                                  <div className="kanban-card-meta">
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                      <span className="kanban-role-badge" style={{ color: badges.roleColor }}>{badges.roleLabel}</span>
                                      {badges.tags.slice(0, 2).map((tg) => {
                                        const isTagAct = activeTags.includes(tg.tag)
                                        return (
                                          <span
                                            key={tg.tag}
                                            className={`kanban-tag-badge${isTagAct ? ' active' : ''}`}
                                            style={{ '--tag-color': tg.color, '--tag-text-color': tg.textColor || '#0b1320' }}
                                            title={`Filter berdasarkan tag #${tg.label}`}
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={isTagAct}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleTagClick(tg.tag, e)
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter' || e.key === ' ') {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                handleTagClick(tg.tag, e)
                                              }
                                            }}
                                          >
                                            #{tg.label}
                                          </span>
                                        )
                                      })}
                                      {badges.tags.length > 2 && (
                                        <span
                                          className="kanban-tag-badge-more"
                                          title={badges.tags.slice(2).map((tg) => `#${tg.label}`).join(', ')}
                                        >
                                          +{badges.tags.length - 2}
                                        </span>
                                      )}
                                      {badges.fileCount > 0 && (
                                        <span className="kanban-file-badge" title={`${badges.fileCount} file dihasilkan`}>
                                          📁 {badges.fileCount}
                                        </span>
                                      )}
                                      {badges.hasReview && (
                                        <span className="kanban-qa-badge" title="Ada ulasan QA">
                                          💬 QA
                                        </span>
                                      )}
                                    </div>
                                    <span className="kanban-status-badge" style={{ color: ST[t.status]?.[1] || col.color }}>{ST[t.status]?.[0] || t.status}</span>
                                  </div>
                                </button>
                              )
                            })
                          )}
                          {dragOverCol === col.key && draggedTaskId && (
                            <div className="kanban-drop-slot" role="status" aria-label={`Lepas di kolom ${col.label}`}>
                              <span aria-hidden="true">{col.icon}</span> Lepas untuk pindah ke {col.label}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              {viewMode === 'list' && tasks && (
                <div style={{ overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map(t => {
                    const prio = getTaskPriorityInfo(t.priority)
                    return (
                      <button
                        key={t.id}
                        className="taskrow"
                        onClick={() => {
                          if (t.priority === 'urgent' && typeof window !== 'undefined' && window.__officeSound) {
                            window.__officeSound.playTaskUrgent?.()
                          } else if (typeof window !== 'undefined' && window.__officeSound) {
                            window.__officeSound.playSelect?.()
                          }
                          setSel(t)
                        }}
                        style={{ borderLeft: `4px solid ${ST[t.status]?.[1] || '#888'}` }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
                            #{t.id}{' '}
                            {getSearchMatchSegments(t.title, q).map((seg, i) =>
                              seg.match ? (
                                <mark key={i} className="kanban-search-highlight">
                                  {seg.text}
                                </mark>
                              ) : (
                                seg.text
                              )
                            )}
                          </div>
                          {t.priority && prio.key !== 'normal' && (
                            <span
                              className="kanban-priority-badge"
                              style={{ color: prio.color, background: prio.bg, flexShrink: 0 }}
                              title={`Prioritas: ${prio.label}`}
                            >
                              <span aria-hidden="true">{prio.icon}</span> {prio.label}
                            </span>
                          )}
                        </div>
                        <div className="note">{t.agent_id || 'unassigned'} · {ST[t.status]?.[0] || t.status}</div>
                        {(() => {
                          const rowBadges = getTaskCardBadges(t)
                          return rowBadges.tags.length > 0 ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                              {rowBadges.tags.slice(0, 3).map((tg) => {
                                const isTagAct = activeTags.includes(tg.tag)
                                return (
                                  <span
                                    key={tg.tag}
                                    className={`kanban-tag-badge${isTagAct ? ' active' : ''}`}
                                    style={{ '--tag-color': tg.color, '--tag-text-color': tg.textColor || '#0b1320' }}
                                    title={`Filter berdasarkan tag #${tg.label}`}
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={isTagAct}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleTagClick(tg.tag, e)
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        handleTagClick(tg.tag, e)
                                      }
                                    }}
                                  >
                                    #{tg.label}
                                  </span>
                                )
                              })}
                            </div>
                          ) : null
                        })()}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
          <footer className="panel-footer-hints" role="note" aria-label="Petunjuk pintasan keyboard">
            <span className="hint-item"><kbd className="hint-kbd">Esc</kbd> {sel ? 'Kembali' : 'Tutup'}</span>
            <span className="hint-item"><kbd className="hint-kbd">T</kbd> Toggle Papan</span>
            <span className="hint-item"><kbd className="hint-kbd">/</kbd> Cari</span>
            {!sel && <span className="hint-item"><kbd className="hint-kbd">CSV/JSON</kbd> Ekspor</span>}
            {!sel && <span className="hint-item"><kbd className="hint-kbd">Shift+Klik</kbd> Multi-Tag</span>}
          </footer>
        </section>
      )}
    </>
  )
}
