// ShConsole — Console "WFS PROJECT AI Software House" (drawer kanan).
// Mengonsumsi API nyata backend: /wfs-api/sh/overview, projects, tasks, agents.
// Tab: Overview | Projects | Tasks | Agents | Project Baru.
import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

const STYLE = {
  overlay: { position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.45)' },
  drawer: {
    position: 'fixed', top: 0, right: 0, height: '100%', width: 460, maxWidth: '94vw',
    background: 'linear-gradient(180deg,#0c1220 0%,#0a0e18 100%)', color: '#d7e0f0',
    borderLeft: '1px solid #1e2a44', boxShadow: '-12px 0 40px rgba(0,0,0,.55)',
    display: 'flex', flexDirection: 'column', zIndex: 2001,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1e2a44' },
  title: { margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '.5px', color: '#f2f6ff' },
  tabbar: { display: 'flex', gap: 4, padding: '10px 12px', borderBottom: '1px solid #1e2a44', flexWrap: 'wrap' },
  tab: { padding: '7px 10px', border: 0, borderRadius: 8, background: '#141c30', color: '#9fb0d0', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  tabActive: { background: '#23324f', color: '#fff' },
  body: { flex: 1, overflowY: 'auto', padding: '14px 16px' },
  card: { background: '#111827', border: '1px solid #1e2a44', borderRadius: 12, padding: 14, marginBottom: 10 },
  stat: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  k: { color: '#8fa2c4', fontSize: 12 },
  v: { fontWeight: 700, fontSize: 16, color: '#eaf1ff' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px dashed #1b2944' },
  btn: { background: '#23324f', border: 0, color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 600 },
  btnGhost: { background: '#1a2340', border: 0, color: '#c5d2ec', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12 },
  input: { width: '100%', background: '#0d1526', border: '1px solid #23324f', color: '#eaf1ff', borderRadius: 8, padding: '10px 12px', marginBottom: 10, boxSizing: 'border-box' },
  select: { width: '100%', background: '#0d1526', border: '1px solid #23324f', color: '#eaf1ff', borderRadius: 8, padding: '10px', marginBottom: 10 },
  tag: { fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#1e2a44', color: '#aebfe0', whiteSpace: 'nowrap' },
  err: { color: '#ff8080', fontSize: 13, padding: 8 },
  logLine: { fontSize: 12, color: '#9fb0d0', borderBottom: '1px dashed #18233c', padding: '6px 0' },
}

const ROLES = ['backend', 'frontend', 'pm', 'design', 'qa', 'devops', 'research', 'content', 'security']

export default function ShConsole({ show, onClose }) {
  const [tab, setTab] = useState('overview')
  const [ov, setOv] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [agents, setAgents] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [tTitle, setTTitle] = useState('')
  const [tRole, setTRole] = useState('backend')
  const [tPrompt, setTPrompt] = useState('')
  const [wsId, setWsId] = useState(null)
  const [wsPath, setWsPath] = useState('')
  const [entries, setEntries] = useState([])
  const [fileView, setFileView] = useState(null)
  const [logs, setLogs] = useState([])
  const [gitInfo, setGitInfo] = useState(null)
  const [termCmd, setTermCmd] = useState('')
  const [termOut, setTermOut] = useState('')
  const [approvals, setApprovals] = useState([])
  const [gitMsg, setGitMsg] = useState('')

  const loadOverview = useCallback(async () => {
    try { setOv(await api('sh/overview')); setErr('') } catch (e) { setErr(e.message) }
  }, [])
  const loadProjects = useCallback(async () => {
    try { const d = await api('projects'); setProjects(d.projects || d || []); setErr('') } catch (e) { setErr(e.message) }
  }, [])
  const loadTasks = useCallback(async () => {
    try { const d = await api('tasks'); setTasks(d.tasks || []); setErr('') } catch (e) { setErr(e.message) }
  }, [])
  const loadAgents = useCallback(async () => {
    try { const d = await api('agents'); setAgents(Array.isArray(d) ? d : []); setErr('') } catch (e) { setErr(e.message) }
  }, [])
  const loadApprovals = useCallback(async () => {
    try { const d = await api('approvals'); setApprovals(d.approvals || []); setErr('') }
    catch (e) { setErr(e.message) }
  }, [])
  const decideApproval = async (aid, action) => {
    try { await api('approvals/' + aid + '/decide', { method: 'POST', body: { action } }); await loadApprovals() }
    catch (e) { setErr(e.message) }
  }
  const commitWs = async (pid) => {
    if (!gitMsg.trim()) { setErr('Pesan commit wajib'); return }
    try {
      await api('projects/' + pid + '/git/commit', { method: 'POST', body: { message: gitMsg.trim() } })
      setGitMsg(''); await loadWsGit(pid); setErr('')
    } catch (e) { setErr(e.message) }
  }

  useEffect(() => {
    if (!show) return
    if (tab === 'overview') loadOverview()
    else if (tab === 'projects') loadProjects()
    else if (tab === 'tasks') loadTasks()
    else if (tab === 'agents') loadAgents()
    else if (tab === 'ws' && projects.length === 0) loadProjects()
    else if (tab === 'approvals') loadApprovals()
  }, [show, tab, loadOverview, loadProjects, loadTasks, loadAgents, projects.length, loadApprovals])

  const create = async () => {
    if (!name.trim() || !brief.trim()) { setErr('Nama dan brief wajib diisi'); return }
    setBusy(true); setErr('')
    try {
      await api('projects', { method: 'POST', body: { name: name.trim(), brief: brief.trim() } })
      setName(''); setBrief(''); await loadProjects(); setTab('projects')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const createTask = async () => {
    if (!tTitle.trim()) { setErr('Judul task wajib diisi'); return }
    setBusy(true); setErr('')
    try {
      await api('tasks', { method: 'POST', body: { title: tTitle.trim(), role: tRole, prompt: tPrompt.trim() } })
      setTTitle(''); setTPrompt(''); await loadTasks()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const runTask = async (tid) => {
    setErr('')
    try { await api('tasks/' + tid + '/run', { method: 'POST', body: {} }); await loadTasks() }
    catch (e) { setErr(e.message) }
  }

  const loadWsFiles = useCallback(async (pid, path) => {
    try {
      const q = path ? '?path=' + encodeURIComponent(path) : ''
      const d = await api('projects/' + pid + '/files' + q)
      setEntries(d.entries || []); setWsPath(d.path || ''); setErr('')
    } catch (e) { setErr(e.message) }
  }, [])
  const openWsFile = async (pid, path) => {
    try {
      const d = await api('projects/' + pid + '/file?path=' + encodeURIComponent(path))
      setFileView({ name: path, content: d.content }); setErr('')
    } catch (e) { setErr(e.message) }
  }
  const loadWsLogs = async (pid) => {
    try { const d = await api('projects/' + pid + '/logs?lines=100'); setLogs(d.logs || []); setErr('') }
    catch (e) { setErr(e.message) }
  }
  const loadWsGit = async (pid) => {
    try { setGitInfo(await api('projects/' + pid + '/git')); setErr('') }
    catch (e) { setErr(e.message) }
  }
  const runTerm = async (pid) => {
    if (!termCmd.trim()) return
    setTermOut('menjalankan…')
    try {
      const d = await api('projects/' + pid + '/exec', { method: 'POST', body: { cmd: termCmd } })
      setTermOut((d.stderr || '') + (d.stdout || ''))
    } catch (e) { setTermOut('ERROR: ' + e.message) }
  }
  const selectWsProject = (pid) => {
    setWsId(pid); setFileView(null); setTermOut(''); setGitInfo(null); setLogs([])
    if (pid) { loadWsFiles(pid, ''); loadWsLogs(pid); loadWsGit(pid) }
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
          {[['overview', 'Overview'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['agents', 'Agents'], ['ws', 'Workspace'], ['approvals', 'Approvals'], ['new', 'Project Baru']].map(([k, label]) => (
            <button key={k} aria-label={'Tab ' + label} style={{ ...STYLE.tab, ...(tab === k ? STYLE.tabActive : {}) }} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div style={STYLE.body}>
          {err && <div style={STYLE.err}>⚠ {err}</div>}
          {tab === 'overview' && <Overview ov={ov} />}
          {tab === 'projects' && <Projects projects={projects} onRefresh={loadProjects} />}
          {tab === 'tasks' && (
            <div>
              <div style={STYLE.card}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Task baru</div>
                <input style={STYLE.input} placeholder="Judul task (mis. Buat komponen Login)" aria-label="Judul task" value={tTitle} onChange={(e) => setTTitle(e.target.value)} />
                <select style={STYLE.select} aria-label="Role" value={tRole} onChange={(e) => setTRole(e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <textarea style={{ ...STYLE.input, minHeight: 70, resize: 'vertical' }} placeholder="Prompt / instruksi detail (opsional)…" aria-label="Prompt task" value={tPrompt} onChange={(e) => setTPrompt(e.target.value)} />
                <button style={STYLE.btn} onClick={createTask} disabled={busy}>{busy ? 'Menyimpan…' : 'Tambah task'}</button>
              </div>
              <div style={STYLE.card}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Daftar task ({tasks.length})</div>
                {tasks.length === 0 && <div style={{ color: '#8fa2c4', fontSize: 13 }}>Belum ada task.</div>}
                {tasks.map((t) => (
                  <div key={t.id} style={STYLE.row}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#eaf1ff' }}>#{t.id} {t.title}</div>
                      <div style={{ fontSize: 12, color: '#8fa2c4' }}>role: {t.role || '—'} · agent: {t.agent_id || '—'}</div>
                    </div>
                    <span style={STYLE.tag}>{t.status}</span>
                    {(t.status === 'pending' || t.status === 'failed' || t.status === 'review') && (
                      <button style={STYLE.btnGhost} onClick={() => runTask(t.id)}>Jalankan</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'agents' && (
            <div>
              <div style={STYLE.card}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Agents ({agents.length})</div>
                {agents.length === 0 && <div style={{ color: '#8fa2c4', fontSize: 13 }}>Belum ada data agent.</div>}
                {agents.map((a) => (
                  <div key={a.id} style={STYLE.row}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#eaf1ff' }}>{a.name || a.id}</div>
                      <div style={{ fontSize: 12, color: '#8fa2c4' }}>{a.role} · Lantai {a.floor || '—'} · {a.model || '—'}</div>
                    </div>
                    <span style={STYLE.tag}>{a.status || 'idle'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'ws' && (
            <div>
              <select style={STYLE.select} aria-label="Pilih project" value={wsId || ''} onChange={(e) => selectWsProject(e.target.value)}>
                <option value="">— pilih project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {!wsId && <div style={{ color: '#8fa2c4' }}>Pilih project untuk melihat workspace.</div>}
              {wsId && (
                <div>
                  <div style={STYLE.card}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>📁 File · {wsPath || '/'}</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <button style={STYLE.btnGhost} onClick={() => loadWsFiles(wsId, '')}>Refresh</button>
                      {wsPath && <button style={STYLE.btnGhost} onClick={() => loadWsFiles(wsId, wsPath.split('/').slice(0, -1).join('/'))}>⬆ Naik</button>}
                    </div>
                    {entries.map((en) => (
                      <div key={en.name} style={{ ...STYLE.row, cursor: 'pointer' }}
                        onClick={() => en.type === 'dir'
                          ? loadWsFiles(wsId, (wsPath ? wsPath + '/' : '') + en.name)
                          : openWsFile(wsId, (wsPath ? wsPath + '/' : '') + en.name)}>
                        <span>{en.type === 'dir' ? '📁 ' : '📄 '}{en.name}</span>
                        {en.size != null && <span style={STYLE.tag}>{en.size} B</span>}
                      </div>
                    ))}
                    {entries.length === 0 && <div style={{ color: '#8fa2c4', fontSize: 13 }}>(folder kosong)</div>}
                    {fileView && (
                      <pre style={{ background: '#0a101c', border: '1px solid #23324f', borderRadius: 8, padding: 10, maxHeight: 220, overflow: 'auto', fontSize: 12, marginTop: 8 }}
                        onClick={(e) => e.stopPropagation()}>{fileView.content}</pre>
                    )}
                  </div>
                  <div style={STYLE.card}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>🪵 Container Logs</div>
                    <button style={STYLE.btnGhost} onClick={() => loadWsLogs(wsId)}>Muat ulang</button>
                    <pre style={{ background: '#0a101c', border: '1px solid #23324f', borderRadius: 8, padding: 10, maxHeight: 180, overflow: 'auto', fontSize: 11 }}>
                      {logs.length ? logs.join('\n') : '(log kosong)'}</pre>
                  </div>
                  <div style={STYLE.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontWeight: 700 }}>🌿 Git</div>
                      <button style={STYLE.btnGhost} onClick={() => loadWsGit(wsId)}>Status</button>
                    </div>
                    {gitInfo && (gitInfo.repo
                      ? <div>
                          <div style={{ fontSize: 12, color: '#8fa2c4', marginBottom: 6 }}>branch: {gitInfo.branch || '—'}</div>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <input style={{ ...STYLE.input, marginBottom: 0, flex: 1 }} placeholder="pesan commit…" aria-label="Pesan commit"
                              value={gitMsg} onChange={(e) => setGitMsg(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitWs(wsId) }} />
                            <button style={STYLE.btn} onClick={() => commitWs(wsId)}>Commit</button>
                          </div>
                          <pre style={{ background: '#0a101c', border: '1px solid #23324f', borderRadius: 8, padding: 10, maxHeight: 160, overflow: 'auto', fontSize: 11 }}>{gitInfo.status || '(bersih)'}</pre>
                          <pre style={{ background: '#0a101c', border: '1px solid #23324f', borderRadius: 8, padding: 10, maxHeight: 160, overflow: 'auto', fontSize: 11 }}>{gitInfo.log}</pre>
                        </div>
                      : <div>
                          <div style={{ color: '#8fa2c4', fontSize: 13, marginBottom: 8 }}>Workspace belum di-inisialisasi git — commit pertama akan init otomatis.</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input style={{ ...STYLE.input, marginBottom: 0, flex: 1 }} placeholder="pesan commit…" aria-label="Pesan commit"
                              value={gitMsg} onChange={(e) => setGitMsg(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitWs(wsId) }} />
                            <button style={STYLE.btn} onClick={() => commitWs(wsId)}>Init + Commit</button>
                          </div>
                        </div>)}
                  </div>
                  <div style={STYLE.card}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>💻 Terminal (di dalam container)</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input style={{ ...STYLE.input, marginBottom: 0, flex: 1 }} placeholder="mis. ls / python3 test_app.py" aria-label="Command"
                        value={termCmd} onChange={(e) => setTermCmd(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') runTerm(wsId) }} />
                      <button style={STYLE.btn} onClick={() => runTerm(wsId)}>Jalankan</button>
                    </div>
                    <pre style={{ background: '#0a101c', border: '1px solid #23324f', borderRadius: 8, padding: 10, maxHeight: 200, overflow: 'auto', fontSize: 11, marginTop: 8 }}>
                      {termOut || '(belum ada output)'}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === 'approvals' && (
            <div>
              <div style={STYLE.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>Menunggu persetujuan ({approvals.length})</div>
                  <button style={STYLE.btnGhost} onClick={loadApprovals}>Refresh</button>
                </div>
                {approvals.length === 0 && <div style={{ color: '#8fa2c4', fontSize: 13 }}>Tidak ada approval pending.</div>}
                {approvals.map((a) => (
                  <div key={a.id} style={{ ...STYLE.row, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#eaf1ff' }}>[{a.action_type}] project #{a.project_id || '-'}</div>
                      <div style={{ fontSize: 12, color: '#8fa2c4' }}>{a.description}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={STYLE.btn} onClick={() => decideApproval(a.id, 'approve')}>Setujui</button>
                      <button style={{ ...STYLE.btn, background: '#4a2030' }} onClick={() => decideApproval(a.id, 'reject')}>Tolak</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
    ['Agent total', ov.agents], ['Subtask jalan', ov.running_subtasks], ['Log event', ov.total_logs],
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
