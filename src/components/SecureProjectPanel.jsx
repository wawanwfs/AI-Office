import React, { useState, useRef, useEffect } from 'react'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const SAFE_NUMBER = /^[0-9]{1,10}$/

function readableError(error) {
  if (error?.name === 'AbortError') return 'Permintaan dibatalkan.'
  return String(error?.message || 'Layanan tidak dapat dihubungi.').slice(0, 180)
}

/**
 * Authenticated Phase 5 project control surface. No fake metrics, no local
 * token storage, and never sends bearer tokens to legacy gateway endpoints.
 */
export default function SecureProjectPanel() {
  const [expanded, setExpanded] = useState(false)
  const [project, setProject] = useState('')
  const [token, setToken] = useState('')
  const [taskId, setTaskId] = useState('')
  const [jobs, setJobs] = useState(null)
  const [budget, setBudget] = useState(null)
  const [events, setEvents] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(null)

  useEffect(() => () => pending.current?.abort(), [])

  const close = () => {
    pending.current?.abort()
    setToken('')
    setJobs(null)
    setBudget(null)
    setEvents(null)
    setError('')
    setNotice('')
    setBusy(false)
    setExpanded(false)
  }

  const request = async (suffix, method = 'GET', ctrl) => {
    const base = '/api/v4/projects/' + encodeURIComponent(project)
    const response = await fetch(base + suffix, {
      method, credentials: 'omit', cache: 'no-store', signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(response.status === 401 ? 'Token tidak valid atau telah kedaluwarsa.'
        : response.status === 404 ? 'Proyek tidak ditemukan atau akses ditolak.'
        : 'Server mengembalikan HTTP ' + response.status)
    }
    return response.json()
  }

  const act = async (kind, value) => {
    if (!SAFE_ID.test(project) || token.length < 20) {
      setError('Masukkan project ID dan bearer token dari operator yang sah.')
      return
    }
    if (kind === 'enqueue' && !SAFE_NUMBER.test(taskId)) {
      setError('Task ID harus berupa angka.')
      return
    }
    pending.current?.abort()
    const ctrl = new AbortController()
    pending.current = ctrl
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (kind === 'enqueue') {
        const result = await request('/tasks/' + encodeURIComponent(taskId) + '/enqueue', 'POST', ctrl)
        setNotice('Task masuk antrean: ' + result.job_id + '. Belum berarti sedang dieksekusi.')
      } else if (kind === 'cancel') {
        if (!SAFE_ID.test(value)) throw new Error('Job ID tidak valid.')
        const result = await request('/jobs/' + encodeURIComponent(value) + '/cancel', 'POST', ctrl)
        setNotice('Permintaan pembatalan tersimpan: ' + result.status)
      }
      const [j, b, e] = await Promise.all([
        request('/jobs', 'GET', ctrl),
        request('/budget', 'GET', ctrl),
        request('/events', 'GET', ctrl),
      ])
      if (!ctrl.signal.aborted) {
        setJobs(j.jobs)
        setBudget(b)
        setEvents(e.events)
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(readableError(e))
    } finally {
      if (pending.current === ctrl) {
        pending.current = null
        setBusy(false)
      }
    }
  }

  return (
    <section className="wfs-secure-panel" aria-label="Kontrol proyek terautentikasi">
      <div className="wfs-secure-heading">
        <div>
          <strong>WFS Secure Control</strong>
          <small>Antrean, budget, QA dan audit dari backend nyata · Phase 5</small>
        </div>
        <button className="btn" onClick={() => expanded ? close() : setExpanded(true)}
          aria-expanded={expanded} aria-controls="wfs-secure-body">
          {expanded ? 'Tutup & hapus token' : 'Buka kontrol proyek'}
        </button>
      </div>
      {expanded && (
        <div id="wfs-secure-body" className="wfs-secure-body">
          <p className="wfs-secure-note">Token hanya digunakan selama panel terbuka, tidak disimpan di browser.
            Jalur API lama sengaja ditutup dalam mode aman. Status offline bukan simulasi agent.</p>
          <div className="wfs-secure-inputs">
            <label>Project ID
              <input aria-label="Project ID terautentikasi" autoComplete="off" value={project}
                onChange={e => setProject(e.target.value)} placeholder="project-001" />
            </label>
            <label>Bearer token
              <input type="password" aria-label="Bearer token operator" autoComplete="off"
                spellCheck={false} value={token} onChange={e => setToken(e.target.value)}
                placeholder="Token dari operator lokal" />
            </label>
            <button className="btn" onClick={() => act('refresh')} disabled={busy}>
              {busy ? 'Menghubungkan…' : 'Muat data nyata'}
            </button>
          </div>
          {error && <p className="wfs-secure-error" role="alert">{error}</p>}
          {notice && <p className="wfs-secure-notice" role="status">{notice}</p>}
          {budget && <div className="wfs-secure-budget" aria-label="Budget proyek">
            <b>{budget.approved ? 'Approved' : 'Belum disetujui'}</b>
            <span>Cap: {budget.cap_microusd.toLocaleString('id-ID')} µUSD</span>
            <span>Sisa: {budget.remaining_microusd.toLocaleString('id-ID')} µUSD</span>
          </div>}
          {jobs !== null && (
            <>
              <div className="wfs-secure-queue-head">
                <strong>Job database ({jobs.length})</strong>
                <div className="wfs-secure-enqueue">
                  <input aria-label="Task ID numerik" value={taskId}
                    onChange={e => setTaskId(e.target.value)} placeholder="Task ID" />
                  <button className="btn" onClick={() => act('enqueue')} disabled={busy}>Enqueue</button>
                </div>
              </div>
              <div className="wfs-secure-jobs" aria-label="Daftar antrean nyata">
                {jobs.length === 0 && <p>Belum ada job pada proyek ini.</p>}
                {jobs.slice(0, 20).map(job => (
                  <div key={job.id} className="wfs-secure-job">
                    <div><b>{job.role}</b> <span>{job.status}</span>
                      <small>{job.id}</small></div>
                    {(job.status === 'queued' || job.status === 'leased') &&
                      <button className="btn" disabled={busy}
                        onClick={() => act('cancel', job.id)}>Batalkan</button>}
                  </div>
                ))}
              </div>
              <p className="wfs-secure-last-events">Audit: {events?.length ?? '—'} event tersimpan untuk proyek ini.</p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
