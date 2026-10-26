import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from '../lib/api'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { parseFileList } from '../lib/files'
import { IconBoard, IconClose, IconPlay, IconRotate, IconList, IconKanban } from './Icons'
import {
  KANBAN_COLUMNS,
  getTaskRoleBadgeColor,
  groupTasksByKanbanColumn,
  computeSprintMetrics,
} from '../scene/parts/kanban_spec'

const ST = { done: ['Selesai', '#10E5A0'], running: ['Jalan', '#F59E0B'], review: ['Review', '#448AFF'], failed: ['Gagal', '#ef4444'], pending: ['Antri', '#9aa7b8'] }
const FILTERS = [['all', 'Semua'], ['pending', 'Antri'], ['running', 'Jalan'], ['done', 'Selesai'], ['failed', 'Gagal']]

// Papan Task: daftar nyata dari task engine, filter, kanban view, detail, jalankan per task.
export default function TaskBoard({ onFlash, onAsk }) {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState(null)
  const [err, setErr] = useState(false)
  const [filter, setFilter] = useState('all')
  const [viewMode, setViewMode] = useState('list') // 'list' | 'kanban'
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const board = useRef(null)
  useModalFlag(open || !!sel)
  const onEscRef = useRef(() => {})
  useEffect(() => { onEscRef.current = () => { sel ? setSel(null) : setOpen(false) } })
  const closeBoard = useCallback(() => onEscRef.current(), [])
  useDialogA11y({ open: open || !!sel, onClose: closeBoard, ref: board })

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
      if (e?.detail?.taskId && tasks) {
        const found = tasks.find(t => String(t.id) === String(e.detail.taskId))
        if (found) setSel(found)
      }
    }
    window.addEventListener('wfs-open-task-board', handleOpen)
    return () => window.removeEventListener('wfs-open-task-board', handleOpen)
  }, [tasks])

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

  const list = (tasks || []).filter(t => (filter === 'all' || t.status === filter) && (!q || (t.title + t.agent_id).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(b.id) - Number(a.id))
  const count = s => (tasks || []).filter(t => s === 'all' || t.status === s).length
  const kanbanGroups = useMemo(() => groupTasksByKanbanColumn(tasks, q), [tasks, q])
  const metrics = useMemo(() => computeSprintMetrics(tasks), [tasks])

  return (
    <>
      <button className="ibtn" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="task-board" aria-label="Papan task" title="Papan task (Kanban)">
        <span className="ic"><IconBoard size={19} /><span className="sr-only">📋</span></span>
        <span className="lb">Papan</span>
      </button>
      {open && (
        <section ref={board} id="task-board" className={`panel left${viewMode === 'kanban' && !sel ? ' wide-kanban' : ''}`} role="dialog" aria-label="Papan task" aria-modal="true">
          <div className="ph">
            <div className="t">
              Papan Task
              <small>
                {tasks ? `${tasks.length} task · ${metrics.done}/${metrics.total} (${metrics.pct}%) selesai${metrics.running ? ` · ● ${metrics.running} jalan` : ''}` : 'memuat…'}
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
          {sel ? (
            <div style={{ padding: 14, overflowY: 'auto' }}>
              <button className="btn" onClick={() => setSel(null)} style={{ marginBottom: 10 }}>← Kembali</button>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>#{sel.id} {sel.title}</h3>
              <p className="note" style={{ marginBottom: 8 }}>Agent: {sel.agent_id} · Role: {sel.role} · <b style={{ color: ST[sel.status]?.[1] }}>{ST[sel.status]?.[0] || sel.status}</b></p>
              {(() => { const fl = parseFileList(sel.files); return fl.length > 0 && <><label className="note">File dihasilkan</label><pre className="note" style={{ whiteSpace: 'pre-wrap', margin: '4px 0 10px', color: '#cfd8e3' }}>{fl.join('\n')}</pre></> })()}
              {sel.review && <><label className="note">Ulasan QA</label><div className="msg" style={{ maxWidth: '100%', marginTop: 4, fontSize: 13 }}>{sel.review}</div></>}
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
                <input className="fld" aria-label="Cari task" placeholder="Cari judul atau agent…" value={q} onChange={e => setQ(e.target.value)} />
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
                    return (
                      <div key={col.key} className="kanban-col" role="region" aria-label={`Kolom ${col.label}`}>
                        <div className="kanban-col-head" style={{ borderTop: `3px solid ${col.color}` }}>
                          <span className="kanban-col-icon" aria-hidden="true">{col.icon}</span>
                          <span className="kanban-col-title">{col.label}</span>
                          <span className="kanban-col-count" style={{ background: col.bg, color: col.color }}>{colTasks.length}</span>
                        </div>
                        <div className="kanban-col-body">
                          {colTasks.length === 0 ? (
                            <div className="kanban-col-empty">Kosong</div>
                          ) : (
                            colTasks.map(t => (
                              <button
                                key={t.id}
                                type="button"
                                className="kanban-card"
                                onClick={() => setSel(t)}
                                style={{ borderLeft: `3px solid ${ST[t.status]?.[1] || col.color}` }}
                                aria-label={`Task #${t.id}: ${t.title}`}
                                title={`Buka task #${t.id}: ${t.title}`}
                              >
                                <div className="kanban-card-top">
                                  <span className="kanban-card-id">#{t.id}</span>
                                  <span className="kanban-card-agent">{t.agent_id}</span>
                                </div>
                                <div className="kanban-card-title">{t.title}</div>
                                <div className="kanban-card-meta">
                                  <span className="kanban-role-badge" style={{ color: getTaskRoleBadgeColor(t.role) }}>{t.role || 'task'}</span>
                                  <span className="kanban-status-badge" style={{ color: ST[t.status]?.[1] || col.color }}>{ST[t.status]?.[0] || t.status}</span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {viewMode === 'list' && tasks && (
                <div style={{ overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map(t => (
                    <button key={t.id} className="taskrow" onClick={() => setSel(t)} style={{ borderLeft: `4px solid ${ST[t.status]?.[1] || '#888'}` }}>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>#{t.id} {t.title}</div>
                      <div className="note">{t.agent_id} · {ST[t.status]?.[0] || t.status}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  )
}
