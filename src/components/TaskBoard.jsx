import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '../lib/api'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { parseFileList } from '../lib/files'
import { IconBoard, IconClose, IconPlay, IconRotate, IconList, IconKanban } from './Icons'
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
  getKanbanColumnEmptyState,
  getTaskPriorityInfo,
  computePriorityBreakdown,
  SORT_OPTIONS,
  canMoveTaskToColumn,
  moveTaskToColumn,
  getKanbanColumnKey,
  computeTagCloud,
  normalizeTagList,
  TAG_PRESETS,
  getTagPreset,
  isPresetActive,
  computePresetStats,
  toggleTagInFilter,
  formatTagFilterSummary,
} from '../scene/parts/kanban_spec'
import { findTeamByRole, findTeamByAgent } from '../scene/parts/team_spec'

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
  const [viewMode, setViewMode] = useState('list') // 'list' | 'kanban'
  const [sortBy, setSortBy] = useState('newest') // 'newest' | 'oldest' | 'priority' | 'title' | 'agent'
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const board = useRef(null)
  useModalFlag(open || !!sel)
  const onEscRef = useRef(() => {})
  useEffect(() => { onEscRef.current = () => { sel ? setSel(null) : setOpen(false) } })
  const closeBoard = useCallback(() => onEscRef.current(), [])
  useDialogA11y({ open: open || !!sel, onClose: closeBoard, ref: board })

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
      if (isPresetActive(presetKey, prev)) {
        return 'all'
      }
      const p = getTagPreset(presetKey)
      return p ? p.tags : 'all'
    })
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [])

  const toggleTagMode = useCallback(() => {
    setTagMode((prev) => (prev === 'any' ? 'all' : 'any'))
    if (typeof window !== 'undefined' && window.__officeSound) {
      window.__officeSound.playSelect?.()
    }
  }, [])

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
      if (e?.detail?.division) setDivision(e.detail.division)
      else if (e?.detail?.role) setDivision(e.detail.role)
      if (e?.detail?.preset) {
        const p = getTagPreset(e.detail.preset)
        if (p) setSelectedTag(p.tags)
      } else if (e?.detail?.tag) {
        setSelectedTag(e.detail.tag)
      }
      if (e?.detail?.tagMode) setTagMode(e.detail.tagMode)
      if (e?.detail?.sortBy) setSortBy(e.detail.sortBy)
      if (e?.detail?.taskId && tasks) {
        const found = tasks.find(t => String(t.id) === String(e.detail.taskId))
        if (found) setSel(found)
      }
    }
    window.addEventListener('wfs-open-task-board', handleOpen)
    return () => window.removeEventListener('wfs-open-task-board', handleOpen)
  }, [tasks])

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
    const k = e => { if (e.key === 'Escape') { sel ? setSel(null) : setOpen(false) } }
    document.addEventListener('keydown', k)
    return () => { ac.abort(); clearTimeout(t0); clearInterval(iv); document.removeEventListener('keydown', k) }
  }, [open, load, sel])

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

    if (onFlash) onFlash(`Task #${task.id} dipindahkan ke kolom ${targetLabel}`)

    // Audio feedback interaktif
    if (typeof window !== 'undefined' && window.__officeSound) {
      if (targetColKey === 'done') {
        window.__officeSound.playTaskDone?.()
      } else if (task.priority === 'urgent') {
        window.__officeSound.playTaskUrgent?.()
      } else {
        window.__officeSound.playSelect?.()
      }
    }
  }, [onFlash])

  const handleDragStart = useCallback((e, t) => {
    if (!t) return
    setDraggedTaskId(t.id)
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', String(t.id))
      e.dataTransfer.effectAllowed = 'move'
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
    if (task) {
      handleMoveTask(task, targetColKey)
    }
  }, [draggedTaskId, tasks, handleMoveTask])

  const divisions = useMemo(() => extractTaskDivisions(tasks), [tasks])
  const activeDivision = useMemo(() => divisions.find(d => d.key === division) || null, [divisions, division])
  const tagCloud = useMemo(() => computeTagCloud(tasks, { divisionFilter: division }), [tasks, division])
  const presetStats = useMemo(() => computePresetStats(tasks, TAG_PRESETS, division), [tasks, division])
  const kanbanGroups = useMemo(
    () => groupTasksByKanbanColumn(tasks, q, division, sortBy, selectedTag, tagMode),
    [tasks, q, division, sortBy, selectedTag, tagMode]
  )
  const metrics = useMemo(() => computeSprintMetrics(tasks, division), [tasks, division])
  const overallMetrics = useMemo(() => computeSprintMetrics(tasks), [tasks])
  const priorityBreakdown = useMemo(() => computePriorityBreakdown(tasks, division), [tasks, division])

  const list = useMemo(
    () => filterTasks(tasks, { filter, q, division, sortBy, tag: selectedTag, tagMode }),
    [tasks, filter, q, division, sortBy, selectedTag, tagMode]
  )
  const count = s => (tasks || []).filter(t => (s === 'all' || t.status === s) && (division === 'all' || matchTaskDivision(t, division))).length

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
                  division !== 'all' ? (
                    `${metrics.total}/${overallMetrics.total} task (${activeDivision?.label || division}) · ${metrics.done}/${metrics.total} (${metrics.pct}%) selesai${metrics.running ? ` · ● ${metrics.running} jalan` : ''}`
                  ) : (
                    `${tasks.length} task · ${metrics.done}/${metrics.total} (${metrics.pct}%) selesai${metrics.running ? ` · ● ${metrics.running} jalan` : ''}`
                  )
                ) : 'memuat…'}
              </small>
            </div>
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
              aria-label={`Progres sprint ${division !== 'all' ? (activeDivision?.fullName || division) : 'kampus'}: ${metrics.pct}% selesai`}
              title={`Progres sprint: ${metrics.done}/${metrics.total} task (${metrics.pct}%) selesai`}
            >
              <div
                className="sprint-progress-fill"
                style={{
                  width: `${metrics.pct}%`,
                  background: division !== 'all' && activeDivision?.color
                    ? `linear-gradient(90deg, ${activeDivision.color}, #448AFF)`
                    : 'linear-gradient(90deg, #10E5A0, #448AFF)',
                }}
              />
            </div>
          )}
          {sel ? (
            <div style={{ padding: 14, overflowY: 'auto' }}>
              <button className="btn" onClick={() => setSel(null)} style={{ marginBottom: 10 }}>← Kembali</button>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>#{sel.id} {sel.title}</h3>
              <p className="note" style={{ marginBottom: 8 }}>
                Agent: {sel.agent_id || '—'} · Role: {sel.role || '—'} ({getTaskRoleLabel(sel.role)}) · Prioritas: <b style={{ color: getTaskPriorityInfo(sel.priority).color }}>{getTaskPriorityInfo(sel.priority).icon} {getTaskPriorityInfo(sel.priority).label}</b> · <b style={{ color: ST[sel.status]?.[1] }}>{ST[sel.status]?.[0] || sel.status}</b>
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
                  <input className="fld" style={{ flex: 1, margin: 0 }} aria-label="Cari task" placeholder="Cari judul, agent, role, prioritas…" value={q} onChange={e => setQ(e.target.value)} />
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
                {/* Strip Filter Divisi / Tim Kampus */}
                {tasks && (
                  <div className="division-filter-strip" role="group" aria-label="Filter berdasarkan divisi kerja">
                    {divisions.map((div) => {
                      const isActive = division === div.key
                      return (
                        <button
                          key={div.key}
                          type="button"
                          className={'div-chip' + (isActive ? ' active' : '')}
                          onClick={() => setDivision(div.key)}
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
                    {division !== 'all' && (
                      <button
                        type="button"
                        className="div-chip-focus-btn"
                        onClick={() => {
                          if (typeof window !== 'undefined' && window.__focusTeam) {
                            window.__focusTeam(division)
                          }
                        }}
                        title={`Fokus kamera 3D ke pod ${activeDivision?.fullName || division}`}
                        aria-label={`Fokus kamera 3D ke pod ${activeDivision?.fullName || division}`}
                      >
                        <span>Fokus Pod 3D ↗</span>
                      </button>
                    )}
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
                        style={{ '--chip-accent': item.color }}
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
                    const isAct = isPresetActive(p.key, selectedTag)
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
                </div>
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
                <div className="kanban-board-container" role="region" aria-label="Papan kanban sprint">
                  {KANBAN_COLUMNS.map(col => {
                    const colTasks = kanbanGroups[col.key] || []
                    const dist = computeColumnDistribution(colTasks.length, metrics.total)
                    const emptyState = getKanbanColumnEmptyState(col.key)
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
                                  draggable={true}
                                  onDragStart={(e) => handleDragStart(e, t)}
                                  onDragEnd={handleDragEnd}
                                  onClick={() => {
                                    if (t.priority === 'urgent' && typeof window !== 'undefined' && window.__officeSound) {
                                      window.__officeSound.playTaskUrgent?.()
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
                                  <div className="kanban-card-title">{t.title}</div>
                                  <div className="kanban-card-meta">
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                      <span className="kanban-role-badge" style={{ color: badges.roleColor }}>{badges.roleLabel}</span>
                                      {badges.tags.slice(0, 2).map((tg) => {
                                        const isTagAct = activeTags.includes(tg.tag)
                                        return (
                                          <span
                                            key={tg.tag}
                                            className={`kanban-tag-badge${isTagAct ? ' active' : ''}`}
                                            style={{ '--tag-color': tg.color }}
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
              )}

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
                          }
                          setSel(t)
                        }}
                        style={{ borderLeft: `4px solid ${ST[t.status]?.[1] || '#888'}` }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>#{t.id} {t.title}</div>
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
                                    style={{ '--tag-color': tg.color }}
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
        </section>
      )}
    </>
  )
}
