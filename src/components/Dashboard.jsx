import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { IconClose, IconStats } from './Icons'
import { clip } from '../lib/clip.js'
import { fileCount } from '../lib/files'

/* Dashboard — overview penuh software house: proyek, task, agen, sandbox, host.
   Semua data NYATA dari /api (task engine, docker stats, dashboard stats). */

const fmtTime = ts => {
  try { return new Date(ts * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

export default function Dashboard({ onOpenBoard, onOpenProjects }) {
  const [open, setOpen] = useState(false)
  const [stats, setStats] = useState(null)
  const [tasks, setTasks] = useState(null)
  const [projects, setProjects] = useState(null)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(false)
  const box = useRef(null)
  useModalFlag(open)
  const onCloseRef = useRef(() => setOpen(false))
  const closeDash = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open, onClose: closeDash, ref: box })

  const load = useCallback(async (signal) => {
    const [s, t, p, r] = await Promise.allSettled([
      api('dashboard/stats', { signal }), api('tasks', { signal }),
      api('projects', { signal }), api('system/resources', { signal }),
    ])
    if (signal?.aborted) return
    // Failed sections are unknown, never zero/empty or silently stale.
    setStats(s.status === 'fulfilled' ? s.value : null)
    setTasks(t.status === 'fulfilled' ? t.value.tasks || [] : null)
    setProjects(p.status === 'fulfilled' ? p.value.projects || [] : null)
    setRes(r.status === 'fulfilled' ? r.value : null)
    setErr([s, t, p, r].some(result => result.status === 'rejected'))
  }, [])

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    const t0 = setTimeout(() => load(ac.signal), 0)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(ac.signal) }, 10000)
    return () => { ac.abort(); clearTimeout(t0); clearInterval(iv) }
  }, [open, load])

  // Toggle via shortcut D / tombol lain (pola sama dgn ProjectPanel & TaskBoard)
  useEffect(() => {
    const h = () => setOpen(v => !v)
    window.addEventListener('wfs-toggle-dashboard', h)
    return () => window.removeEventListener('wfs-toggle-dashboard', h)
  }, [])

  const byStatus = {}
  let totalFiles = 0
  ;(tasks || []).forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; totalFiles += fileCount(t.files) })
  const running = (tasks || []).filter(t => t.status === 'running').length
  const agentsBusy = (tasks || []).filter(t => t.status === 'running' && t.agent_id).map(t => t.agent_id)
  const card = (label, val, color) => (
    <div key={label} className="dash-card" role="group" aria-label={label}>
      <b style={{ color }}>{val}</b>
      <span>{label}</span>
    </div>
  )

  return (
    <>
      {open && (
        <div ref={box} id="dashboard" className="panel wide" role="dialog" aria-label="Dashboard" aria-modal="true">
          <div className="ph">
            <div className="t">Dashboard<small>overview software house · refresh 10 dtk</small></div>
            <button className="x" onClick={() => setOpen(false)} aria-label="Tutup dashboard" title="Tutup dashboard (Esc)">
              <IconClose size={18} />
              <span className="sr-only">✕</span>
            </button>
          </div>
          <div className="dash-body" aria-live="polite">
            <nav className="dash-nav" aria-label="Navigasi dashboard">
              <button className="btn" onClick={() => { setOpen(false); onOpenBoard?.() }}>Buka papan task</button>
              <button className="btn" onClick={() => { setOpen(false); onOpenProjects?.() }}>Buka daftar proyek</button>
            </nav>
            {!stats && !err && <div className="skeleton" role="status">Memuat dashboard…</div>}
            {err && <div role="alert" className="msg err" style={{ maxWidth: '100%' }}>Data belum lengkap — sebagian layanan tidak dapat dihubungi. <button className="btn" style={{ minHeight: 32, marginLeft: 6 }} onClick={() => load()}>Coba lagi</button></div>}
            {stats && (
              <>
                <div className="dash-grid">
                  {card('Proyek', stats.projects_total ?? 0, '#4D9FFF')}
                  {card('Proyek jalan', stats.projects_running ?? 0, '#F59E0B')}
                  {card('Task', stats.tasks_total ?? 0, '#8B5CF6')}
                  {card('Task jalan', stats.tasks_running ?? running, '#F59E0B')}
                  {card('Selesai', stats.tasks_completed ?? (byStatus.done || 0), '#10E5A0')}
                  {card('Agen', stats.agents_count ?? 0, '#4D9FFF')}
                  {card('File dihasilkan', tasks ? totalFiles : '—', '#ADDBF2')}
                  {card('Sandbox', res ? (res.containers || []).filter(c => /wfs-sandbox|sbx/.test(c.name)).length : '—', '#60A5FA')}
                </div>

                <div className="dash-cols">
                  <section aria-label="Proyek">
                    <div className="dash-sec">
                      <span>Proyek</span>
                      <button className="btn" style={{ minHeight: 28 }} onClick={() => { setOpen(false); onOpenProjects && onOpenProjects() }}>Buka panel proyek</button>
                    </div>
                    {projects === null && <p>Data proyek tidak tersedia.</p>}
                    {projects?.length === 0 && <div className="skeleton">Belum ada proyek.</div>}
                    {(projects || []).slice(0, 6).map(p => (
                      <button key={p.id} className="dash-row" onClick={() => { setOpen(false); onOpenProjects && onOpenProjects() }}
                        aria-label={`Proyek ${p.name} status ${p.status}`}
                        title={p.preview_url ? `Preview: ${p.preview_url}` : 'Belum ada sandbox'}>
                        <span className="dash-row-t">
                          <b style={{ color: p.status === 'running' ? '#10E5A0' : '#9aa3b5' }}>●</b> {clip(p.name, 26)}
                        </span>
                        <span className="dash-row-s">{p.status}{p.preview_port ? ` :${p.preview_port}` : ''}</span>
                      </button>
                    ))}
                  </section>

                  <section aria-label="Task terkini">
                    <div className="dash-sec"><span>Task terkini</span><span className="note">{byStatus.running || 0} jalan</span></div>
                    {tasks === null && <p>Data task tidak tersedia.</p>}
                    {tasks?.length === 0 && <div className="skeleton">Belum ada task. Klik ＋ Task.</div>}
                    {(tasks || []).slice(0, 7).map(t => (
                      <button key={t.id} className="dash-row" style={{ borderLeft: `3px solid ${t.status === 'done' ? '#10E5A0' : t.status === 'failed' ? '#f66' : t.status === 'running' ? '#F59E0B' : '#60A5FA'}` }}
                        onClick={() => { setOpen(false); onOpenBoard && onOpenBoard() }}
                        aria-label={`Task ${t.id}: ${t.title} status ${t.status}`}>
                        <span className="dash-row-t">{clip(t.title, 30)}</span>
                        <span className="dash-row-s">{t.agent_id || t.status}</span>
                      </button>
                    ))}
                  </section>

                  <section aria-label="Agen & sandbox">
                    <div className="dash-sec"><span>Agen aktif</span><span className="note">{tasks === null ? 'Status agen tidak tersedia' : agentsBusy.length ? `${agentsBusy.length} mengerjakan task` : 'semua idle'}</span></div>
                    {!res && <p>Data container tidak tersedia.</p>}
                    {res && (res.containers || []).length === 0 && <div className="skeleton">Tidak ada container.</div>}
                    {(res?.containers || []).filter(c => /wfs-sandbox|sbx|dibantuin|omniroute/.test(c.name)).slice(0, 8).map(c => (
                      <div key={c.name} className="dash-row" style={{ cursor: 'default' }}>
                        <span className="dash-row-t">{c.name.replace('wfs-sandbox-', 'sbx · ').replace('saas-dibantuin-', 'dbt · ').replace('wfs-office-', '')}</span>
                        <span className="dash-row-s">{c.cpu} · {c.mem}</span>
                      </div>
                    ))}
                  </section>
                </div>

                <div className="dash-sec" style={{ marginTop: 10 }}><span>Log aktivitas terbaru</span></div>
                <div className="dash-log" aria-label="Log aktivitas">
                  {(stats.logs || []).slice(0, 8).map(l => (
                    <div key={l.id} className="dash-log-row">
                      <span className="dash-log-t">{fmtTime(l.timestamp)}</span>
                      <span>{clip(l.message, 86)}</span>
                    </div>
                  ))}
                  {(stats.logs || []).length === 0 && <div className="skeleton">Belum ada log.</div>}
                </div>

                {res && (
                  <div className="dash-host">
                    🖥 HOST · load {res.load} · RAM {res.ram_mb} MB · {res.containers?.length || 0} container
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <button className="ibtn accent" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="dashboard" aria-label="Dashboard" title="Dashboard — overview proyek, task, agen, sandbox (shortcut D)">
        <span className="ic"><IconStats size={19} /><span className="sr-only">📊</span></span><span className="lb">Dashboard</span>
      </button>
    </>
  )
}
