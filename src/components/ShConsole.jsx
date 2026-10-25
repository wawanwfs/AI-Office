// ShConsole — Console "WFS PROJECT AI Software House" (drawer kanan).
// Mengonsumsi API nyata backend: /wfs-api/sh/overview & /wfs-api/projects.
// Tiga tab: Overview (statistik), Projects (daftar + preview container), New Project.
import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

const STYLE = {
  overlay: { position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.45)' },
  drawer: {
    position: 'fixed', top: 0, right: 0, height: '100%', width: 420, maxWidth: '92vw',
    background: 'linear-gradient(180deg,#0c1220 0%,#0a0e18 100%)', color: '#d7e0f0',
    borderLeft: '1px solid #1e2a44', boxShadow: '-12px 0 40px rgba(0,0,0,.55)',
    display: 'flex', flexDirection: 'column', zIndex: 2001,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1e2a44' },
  title: { margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '.5px', color: '#f2f6ff' },
  tabbar: { display: 'flex', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e2a44' },
  tab: { flex: 1, padding: '8px 0', border: 0, borderRadius: 8, background: '#141c30', color: '#9fb0d0', cursor: 'pointer', fontWeight: 600 },
  tabActive: { background: '#23324f', color: '#fff' },
  body: { flex: 1, overflowY: 'auto', padding: '14px 16px' },
  card: { background: '#111827', border: '1px solid #1e2a44', borderRadius: 12, padding: 14, marginBottom: 10 },
  stat: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  k: { color: '#8fa2c4', fontSize: 12 },
  v: { fontWeight: 700, fontSize: 16, color: '#eaf1ff' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px dashed #1b2944' },
  btn: { background: '#23324f', border: 0, color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 600 },
  input: { width: '100%', background: '#0d1526', border: '1px solid #23324f', color: '#eaf1ff', borderRadius: 8, padding: '10px 12px', marginBottom: 10, boxSizing: 'border-box' },
  tag: { fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#1e2a44', color: '#aebfe0', whiteSpace: 'nowrap' },
  err: { color: '#ff8080', fontSize: 13, padding: 8 },
  logLine: { fontSize: 12, color: '#9fb0d0', borderBottom: '1px dashed #18233c', padding: '6px 0' },
}

export default function ShConsole({ show, onClose }) {
  const [tab, setTab] = useState('overview')
  const [ov, setOv] = useState(null)
  const [projects, setProjects] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')

  const loadOverview = useCallback(async () => {
    try { setOv(await api('sh/overview')); setErr('') } catch (e) { setErr(e.message) }
  }, [])
  const loadProjects = useCallback(async () => {
    try { const d = await api('projects'); setProjects(d.projects || d || []); setErr('') } catch (e) { setErr(e.message) }
  }, [])

  useEffect(() => {
    if (!show) return
    if (tab === 'overview') loadOverview()
    if (tab === 'projects') loadProjects()
  }, [show, tab, loadOverview, loadProjects])

  const create = async () => {
    if (!name.trim() || !brief.trim()) { setErr('Nama dan brief wajib diisi'); return }
    setBusy(true); setErr('')
    try {
      await api('projects', { method: 'POST', body: { name: name.trim(), brief: brief.trim() } })
      setName(''); setBrief('')
      await loadProjects(); setTab('projects')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (!show) return null

  return (
    <div style={STYLE.overlay} onClick={onClose}>
      <div style={STYLE.drawer} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Konsol Software House">
        <div style={STYLE.head}>
          <h2 style={STYLE.title}>WFS PROJECT · Konsol</h2>
          <button className="ibtn" onClick={onClose} aria-label="Tutup konsol" title="Tutup">✕</button>
        </div>
        <div style={STYLE.tabbar}>
          {[['overview', 'Overview'], ['projects', 'Projects'], ['new', 'Project Baru']].map(([k, label]) => (
            <button key={k} style={{ ...STYLE.tab, ...(tab === k ? STYLE.tabActive : {}) }} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div style={STYLE.body}>
          {err && <div style={STYLE.err}>⚠ {err}</div>}
          {tab === 'overview' && <Overview ov={ov} />}
          {tab === 'projects' && <Projects projects={projects} onRefresh={loadProjects} />}
          {tab === 'new' && (
            <div>
              <input style={STYLE.input} placeholder="Nama project (mis. Landing Page Agen)" aria-label="Nama project" value={name} onChange={(e) => setName(e.target.value)} />
              <textarea style={{ ...STYLE.input, minHeight: 90, resize: 'vertical' }} placeholder="Brief / deskripsi project…" aria-label="Brief" value={brief} onChange={(e) => setBrief(e.target.value)} />
              <button style={STYLE.btn} onClick={create} disabled={busy}>{busy ? 'Membuat + menjalankan container…' : 'Buat project & jalankan container'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Overview({ ov }) {
  if (!ov) return <p style={{ color: '#8fa2c4' }}>Memuat statistik…</p>
  const stats = [
    ['Projects', ov.projects], ['Task total', ov.tasks],
    ['Agents', ov.agents], ['Subtask jalan', ov.running_subtasks], ['Log event', ov.total_logs],
  ]
  return (
    <div>
      <div style={{ ...STYLE.card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {stats.map(([k, v]) => (
          <div key={k} style={STYLE.stat}>
            <span style={STYLE.k}>{k}</span><span style={STYLE.v}>{v}</span>
          </div>
        ))}
      </div>
      <div style={STYLE.card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Task per status</div>
        {Object.keys(ov.task_by_status || {}).length === 0 && <div style={{ color: '#8fa2c4', fontSize: 13 }}>Belum ada task.</div>}
        {Object.entries(ov.task_by_status || {}).map(([k, v]) => (
          <div key={k} style={STYLE.row}><span style={STYLE.k}>{k}</span><span style={STYLE.tag}>{v}</span></div>
        ))}
      </div>
      <div style={STYLE.card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Agents per status</div>
        {Object.entries(ov.agent_by_status || {}).map(([k, v]) => (
          <div key={k} style={STYLE.row}><span style={STYLE.k}>{k}</span><span style={STYLE.tag}>{v}</span></div>
        ))}
      </div>
      <div style={STYLE.card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Log terbaru</div>
        {ov.recent_logs.length === 0 && <div style={{ color: '#8fa2c4', fontSize: 13 }}>Belum ada log.</div>}
        {ov.recent_logs.map((l, i) => (
          <div key={i} style={STYLE.logLine}><b>{l.level}</b> · {l.message} <span style={{ color: '#5f6f90' }}>({l.source})</span></div>
        ))}
      </div>
    </div>
  )
}

function Projects({ projects, onRefresh }) {
  if (!projects) return <p style={{ color: '#8fa2c4' }}>Memuat daftar project…</p>
  if (projects.length === 0) {
    return <div style={STYLE.card}><div style={{ color: '#8fa2c4' }}>Belum ada project. Buat lewat tab "Project Baru".</div></div>
  }
  return (
    <div>
      {projects.map((p) => (
        <div key={p.id} style={STYLE.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>{p.name || p.title}</b>
            <span style={STYLE.tag}>{p.status || '—'}</span>
          </div>
          <div style={{ fontSize: 12, color: '#8fa2c4', margin: '6px 0' }}>{p.description || ''}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(p.preview_url || p.direct_url) && (
              <button style={STYLE.btn} onClick={() => window.open(p.preview_url || p.direct_url, '_blank')}>Buka Preview ↗</button>
            )}
            <button style={{ ...STYLE.btn, background: '#18233c' }} onClick={onRefresh}>Refresh</button>
          </div>
        </div>
      ))}
    </div>
  )
}
