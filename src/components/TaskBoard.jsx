import React, { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { parseFileList } from '../lib/files'

const ST = { done: ['Selesai', '#10E5A0'], running: ['Jalan', '#F59E0B'], review: ['Review', '#448AFF'], failed: ['Gagal', '#ef4444'], pending: ['Antri', '#9aa7b8'] }
const FILTERS = [['all', 'Semua'], ['pending', 'Antri'], ['running', 'Jalan'], ['done', 'Selesai'], ['failed', 'Gagal']]

// Papan Task: daftar nyata dari task engine, filter, detail, jalankan per task.
export default function TaskBoard({ onFlash, onAsk }) {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState(null)
  const [err, setErr] = useState(false)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const board = useRef(null)
  useModalFlag(open || !!sel)
  const onEscRef = useRef(() => {})
  onEscRef.current = () => { sel ? setSel(null) : setOpen(false) }
  const escA11yRef = useRef(() => {})
  escA11yRef.current = () => onEscRef.current()
  const closeBoard = useCallback(() => escA11yRef.current(), [])
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
    if (!open) return
    const ac = new AbortController()
    const t0 = setTimeout(() => load(ac.signal), 0)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(ac.signal) }, 8000)
    const k = e => { if (e.key === 'Escape') { sel ? setSel(null) : setOpen(false) } }
    document.addEventListener('keydown', k)
    return () => { ac.abort(); clearTimeout(t0); clearInterval(iv); document.removeEventListener('keydown', k) }
  }, [open, load, sel])

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

  return (
    <>
      <button className="ibtn" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="task-board"><span className="ic">📋</span><span className="lb">Papan</span></button>
      {open && (
        <section ref={board} id="task-board" className="panel left" role="dialog" aria-label="Papan task" aria-modal="true">
          <div className="ph">
            <div className="t">Papan Task<small>{tasks ? `${tasks.length} task` : 'memuat…'}</small></div>
            <button className="x" onClick={() => setOpen(false)} aria-label="Tutup papan task">✕</button>
          </div>
          {sel ? (
            <div style={{ padding: 14, overflowY: 'auto' }}>
              <button className="btn" onClick={() => setSel(null)} style={{ marginBottom: 10 }}>← Kembali</button>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>#{sel.id} {sel.title}</h3>
              <p className="note" style={{ marginBottom: 8 }}>Agent: {sel.agent_id} · Role: {sel.role} · <b style={{ color: ST[sel.status]?.[1] }}>{ST[sel.status]?.[0] || sel.status}</b></p>
              {(() => { const fl = parseFileList(sel.files); return fl.length > 0 && <><label className="note">File dihasilkan</label><pre className="note" style={{ whiteSpace: 'pre-wrap', margin: '4px 0 10px', color: '#cfd8e3' }}>{fl.join('\n')}</pre></> })()}
              {sel.review && <><label className="note">Ulasan QA</label><div className="msg" style={{ maxWidth: '100%', marginTop: 4, fontSize: 13 }}>{sel.review}</div></>}
              {sel.status !== 'running' && sel.status !== 'done' && <button className="btn primary" style={{ marginTop: 12 }} onClick={() => ask(sel)}>▶ Jalankan task</button>}
              {sel.status === 'done' && <button className="btn" style={{ marginTop: 12 }} onClick={() => ask(sel)}>↻ Jalankan ulang</button>}
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 12px 0' }}>
                <input className="fld" aria-label="Cari task" placeholder="Cari judul atau agent…" value={q} onChange={e => setQ(e.target.value)} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {FILTERS.map(([k, l]) => <button key={k} className={'btn' + (filter === k ? ' primary' : '')} style={{ minHeight: 34, padding: '0 10px', fontSize: 12 }} onClick={() => setFilter(k)}>{l} {count(k)}</button>)}
                </div>
              </div>
              <div style={{ overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {err && <div className="msg err">Gagal memuat task. <button className="btn" onClick={() => load()}>Coba lagi</button></div>}
                {!tasks && !err && <div className="skeleton">Memuat task…</div>}
                {tasks && list.length === 0 && <div className="skeleton">Tidak ada task yang cocok.</div>}
                {list.map(t => (
                  <button key={t.id} onClick={() => setSel(t)} style={{ textAlign: 'left', minHeight: 52, padding: '8px 12px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderLeft: `4px solid ${ST[t.status]?.[1] || '#888'}`, borderRadius: 10, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>#{t.id} {t.title}</div>
                    <div className="note">{t.agent_id} · {ST[t.status]?.[0] || t.status}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </>
  )
}
