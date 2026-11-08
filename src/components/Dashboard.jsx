import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import SecureProjectPanel from './SecureProjectPanel'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { IconClose, IconStats } from './Icons'
import { clip } from '../lib/clip.js'
import { fileCount } from '../lib/files'
import { fmtTime } from '../lib/format_time.js'
import { dashboardPresenceSummary } from '../scene/parts/agent_status.js'

/* Dashboard — overview penuh software house: proyek, task, agen, sandbox, host.
   Semua data NYATA dari /api (task engine, docker stats, dashboard stats). */

export default function Dashboard({ onOpenBoard, onOpenProjects }) {
  const [open, setOpen] = useState(false)
  const [stats, setStats] = useState(null)
  const [tasks, setTasks] = useState(null)
  const [projects, setProjects] = useState(null)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(false)
  const box = useRef(null)
  // rid guard poll out-of-order (pola TaskBoard siklus 131): interval 10 dtk tak
  // membatalkan poll in-flight sebelumnya — batch respons LAMA tiba belakangan
  // tak menimpa data BARU; kegagalan batch basi tak menaikkan banner palsu.
  const loadRid = useRef(0)
  useModalFlag(open)
  const onCloseRef = useRef(() => setOpen(false))
  const closeDash = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open, onClose: closeDash, ref: box })

  const load = useCallback(async (signal) => {
    const rid = ++loadRid.current
    const [s, t, p, r, st] = await Promise.allSettled([
      api('dashboard/stats', { signal }), api('tasks', { signal }),
      api('projects', { signal }), api('system/resources', { signal }),
      api('status', { signal }),
    ])
    if (loadRid.current !== rid) return // poll lebih baru / dashboard ditutup — batch basi, abaikan
    // Failed sections are unknown, never zero/empty or silently stale.
    const tasks = t.status === 'fulfilled' ? t.value.tasks || [] : null
    const projects = p.status === 'fulfilled' ? p.value.projects || [] : null
    const res = r.status === 'fulfilled' ? r.value : null
    const stat = st.status === 'fulfilled' ? st.value : null
    let sval = s.status === 'fulfilled' ? s.value : null
    // Siklus 151: gateway produksi (:8787) TIDAK punya /api/dashboard/stats →
    // proxy 404 permanen → panel sebelumnya hanya banner error selamanya.
    // Fallback: turunkan angka dari data NYATA endpoint lain (bukan mengarang);
    // banner err tetap naik bila sumber pengganti pun gagal.
    if (!sval && (tasks || projects || res || stat)) {
      sval = {
        projects_total: projects ? projects.length : undefined,
        projects_running: projects ? projects.filter(x => x.status === 'running').length : undefined,
        tasks_total: tasks ? tasks.length : undefined,
        tasks_running: tasks ? tasks.filter(x => x.status === 'running').length : undefined,
        tasks_completed: tasks ? tasks.filter(x => x.status === 'done' || x.status === 'completed').length : undefined,
        agents_count: stat ? stat.agents : undefined,
        logs: [],
        derived: true,
      }
    }
    setStats(sval)
    setTasks(tasks)
    setProjects(projects)
    setRes(res)
    setErr([t, p, r, st].some(result => result.status === 'rejected'))
  }, [])

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    const t0 = setTimeout(() => load(ac.signal), 0)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(ac.signal) }, 10000)
    return () => { ac.abort(); clearTimeout(t0); clearInterval(iv);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- bump rid saat cleanup memang disengaja (guard async), bukan membaca snapshot ref
      loadRid.current++ }
  }, [open, load])

  // Toggle via shortcut D / tombol lain (pola sama dgn ProjectPanel & TaskBoard)
  useEffect(() => {
    const h = () => setOpen(v => !v)
    window.addEventListener('wfs-toggle-dashboard', h)
    return () => window.removeEventListener('wfs-toggle-dashboard', h)
  }, [])

  // Siklus 151: kehadiran LIVE agen kantor dari scene (window.__agentData) —
  // poll 4 dtk hanya saat panel terbuka (pola TeamStats 150/Ticker 149; scene
  // absen/UI-only → null, paragraf disembunyikan, teks fallback task utuh).
  const [presence, setPresence] = useState(null)
  useEffect(() => {
    if (!open) return
    const read = () => setPresence(dashboardPresenceSummary(window.__agentData))
    read()
    const iv = setInterval(() => {
      // Tab disembunyikan → scene render loop ikut pause, data scene basi:
      // jangan timpa ringkasan dengan snapshot usang (pola gate SysMeter/HUD).
      if (document.visibilityState === 'visible') read()
    }, 4000)
    // Tab kembali terlihat setelah sembunyi lama: interval 4 dtk mungkin baru
    // "bangun" di tengah periode → baca segera agar ringkasan tidak usang.
    document.addEventListener('visibilitychange', read)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', read)
    }
  }, [open])

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
      {open && createPortal(
        <div className="dashboard-overlay">
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
            <SecureProjectPanel />
            {!stats && !err && <div className="skeleton" role="status">Memuat dashboard…</div>}
            {err && <div role="alert" className="msg err" style={{ maxWidth: '100%' }}>Data belum lengkap — sebagian layanan tidak dapat dihubungi. <button className="btn" style={{ minHeight: 32, marginLeft: 6 }} onClick={() => load()}>Coba lagi</button></div>}
            {stats && (
              <>
                <div className="dash-grid">
                  {card('Proyek', stats.projects_total ?? (projects ? projects.length : '—'), '#4D9FFF')}
                  {card('Proyek jalan', stats.projects_running ?? (projects ? projects.filter(p => p.status === 'running').length : '—'), '#F59E0B')}
                  {card('Task', stats.tasks_total ?? (tasks ? tasks.length : '—'), '#8B5CF6')}
                  {card('Task jalan', stats.tasks_running ?? (tasks ? running : '—'), '#F59E0B')}
                  {card('Selesai', stats.tasks_completed ?? (tasks ? (byStatus.done || byStatus.completed || 0) : '—'), '#10E5A0')}
                  {card('Agen task engine', stats.agents_count ?? '—', '#4D9FFF')}
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
                    {/* Siklus 151: kehadiran LIVE agen KANTOR dari scene 3D —
                        task engine tak tahu siapa yang rapat/makan siang; scene tahu.
                        null (scene absen) → tak dirender, teks task-engine di atas utuh. */}
                    {presence && (
                      <div className="dash-presence" role="status" title="Simulasi avatar kantor, bukan status eksekusi task">
                        <i style={{ background: '#10E5A0' }} aria-hidden="true" />
                        <b aria-hidden="true">{presence.total} avatar simulasi:</b> {presence.text}
                        <span className="sr-only">Simulasi: {presence.total} avatar di kantor — {presence.text}</span>
                      </div>
                    )}
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
        </div>, document.body
      )}
      <button className="ibtn accent" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="dashboard" aria-label="Dashboard" title="Dashboard — overview proyek, task, agen, sandbox (shortcut D)">
        <span className="ic"><IconStats size={19} /><span className="sr-only">📊</span></span><span className="lb">Dashboard</span>
      </button>
    </>
  )
}
