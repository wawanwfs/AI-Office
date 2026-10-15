import React, { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

const ROLES = ['backend', 'frontend', 'mobile', 'design', 'devops', 'qa', 'marketing', 'pm']

// Modal buat task nyata (POST /api/tasks). Opsional langsung dijalankan.
export default function TaskModal({ show, onClose, onDone }) {
  const [title, setTitle] = useState('')
  const [role, setRole] = useState('backend')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const first = useRef(null)

  useEffect(() => {
    if (!show) return
    setErr(''); setTimeout(() => first.current && first.current.focus(), 30)
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [show])

  if (!show) return null
  const submit = async (run) => {
    if (!title.trim()) return setErr('Judul task wajib diisi')
    setBusy(true); setErr('')
    try {
      const d = await api('tasks', { method: 'POST', body: { title: title.trim(), role, prompt: prompt.trim() } })
      if (run) await api(`tasks/${d.task_id}/run`, { method: 'POST' })
      onDone(run ? `Task #${d.task_id} dibuat & dijalankan` : `Task #${d.task_id} dibuat (pending)`)
      setTitle(''); setPrompt(''); onClose()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  return (
    <div className="modal-scrim" onClick={onClose}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="tm-t" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); submit(false) }}>
        <h3 id="tm-t">＋ Task Baru</h3>
        <label htmlFor="tm-title">Judul</label>
        <input id="tm-title" ref={first} value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="mis. Buat endpoint /api/invoice" />
        <label htmlFor="tm-role">Role / agent</label>
        <select id="tm-role" value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
        <label htmlFor="tm-prompt">Brief (opsional)</label>
        <textarea id="tm-prompt" rows={4} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Detail yang harus dikerjakan agent" />
        {err && <div role="alert" className="msg err" style={{ maxWidth: '100%', marginTop: 10 }}>{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button type="submit" className="btn" disabled={busy}>Simpan</button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => submit(true)}>Simpan & Jalankan</button>
        </div>
      </form>
    </div>
  )
}
