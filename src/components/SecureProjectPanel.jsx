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
  const [briefTitle, setBriefTitle] = useState('')
  const [briefText, setBriefText] = useState('')
  const [codeRole, setCodeRole] = useState('backend')
  const [jobs, setJobs] = useState(null)
  const [budget, setBudget] = useState(null)
  const [events, setEvents] = useState(null)
  const [evidence, setEvidence] = useState(null)
  const [previewCheck, setPreviewCheck] = useState(null)
  const [invoiceCheck, setInvoiceCheck] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(null)
  const briefKey = useRef(null)

  useEffect(() => () => pending.current?.abort(), [])

  const close = () => {
    pending.current?.abort()
    briefKey.current = null
    setToken('')
    setBriefTitle('')
    setBriefText('')
    setJobs(null)
    setBudget(null)
    setEvents(null)
    setEvidence(null)
    setPreviewCheck(null)
    setInvoiceCheck(null)
    setError('')
    setNotice('')
    setBusy(false)
    setExpanded(false)
  }

  const request = async (suffix, method = 'GET', ctrl, body = null, extraHeaders = {}) => {
    const base = '/api/v4/projects/' + encodeURIComponent(project)
    const response = await fetch(base + suffix, {
      method, credentials: 'omit', cache: 'no-store', signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
      ...(body ? { body: JSON.stringify(body) } : {}),
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
    if (kind === 'create' && (briefTitle.trim().length < 3 || briefText.trim().length < 30 ||
      briefTitle.length > 120 || briefText.length > 12000)) {
      setError('Judul minimal 3 karakter dan brief minimal 30 karakter (maks. 12.000).')
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
      if (kind === 'create') {
        if (!briefKey.current) {
          if (typeof crypto?.randomUUID !== 'function') {
            throw new Error('Browser tidak menyediakan ID aman; gunakan koneksi HTTPS.')
          }
          briefKey.current = 'brief-' + crypto.randomUUID()
        }
        const result = await request('/briefs', 'POST', ctrl, {
          title: briefTitle.trim(), brief: briefText.trim(), role: codeRole,
        }, { 'Idempotency-Key': briefKey.current })
        briefKey.current = null
        setTaskId(String(result.task_id))
        setNotice('Brief tersimpan sebagai task #' + result.task_id +
          ', job ' + result.job_id + '. Menunggu worker terotorisasi & Docker QA; preview belum dipublikasikan.')
      } else if (kind === 'enqueue') {
        const result = await request('/tasks/' + encodeURIComponent(taskId) + '/enqueue', 'POST', ctrl)
        setNotice('Task masuk antrean: ' + result.job_id + '. Belum berarti sedang dieksekusi.')
      } else if (kind === 'evidence') {
        if (!SAFE_ID.test(value)) throw new Error('Job ID tidak valid.')
        const result = await request('/jobs/' + encodeURIComponent(value) + '/artifacts', 'GET', ctrl)
        setEvidence(result)
        setNotice('Manifest QA terverifikasi untuk job ' + value + '. Tidak berarti preview aplikasi aktif.')
      } else if (kind === 'preview') {
        const result = await request('/preview/api/health', 'GET', ctrl)
        setPreviewCheck(result)
        setNotice('Healthcheck berasal dari backend preview yang diizinkan operator.')
      } else if (kind === 'invoice') {
        const result = await request('/billing/reconciliation', 'GET', ctrl)
        setInvoiceCheck(result)
        setNotice('Audit invoice hanya memeriksa bukti lokal; tidak membuktikan tagihan provider resmi.')
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
          <small>Brief coding, QA artifact, preview inspection & billing audit · backend nyata · Phase 7</small>
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
          <div className="wfs-secure-brief">
            <strong>Buat aplikasi dari brief</strong>
            <p>Hanya Python backend yang dapat diantrekan saat worker QA telah disetujui. Pembuatan file, pengujian Docker dan publikasi preview adalah tahap terpisah, bukan simulasi instan.</p>
            <label>Judul tugas
              <input aria-label="Judul brief coding" value={briefTitle} maxLength={120}
                onChange={e => { briefKey.current = null; setBriefTitle(e.target.value) }} placeholder="API inventori dengan tes unittest" />
            </label>
            <label>Instruksi aplikasi
              <textarea aria-label="Instruksi brief coding" value={briefText} maxLength={12000}
                onChange={e => { briefKey.current = null; setBriefText(e.target.value) }} rows={4}
                placeholder="Jelaskan fitur API, format data dan kebutuhan tes objektif…" />
            </label>
            <div className="wfs-secure-brief-footer">
              <label>Agent
                <select aria-label="Peran coding" value={codeRole}
                  onChange={e => { briefKey.current = null; setCodeRole(e.target.value) }}>
                  <option value="backend">Python Backend</option>
                  <option value="backend2">Python Backend 2</option>
                </select>
              </label>
              <button className="btn" disabled={busy} onClick={() => act('create')}>
                Buat task & antrekan
              </button>
            </div>
          </div>
          {error && <p className="wfs-secure-error" role="alert">{error}</p>}
          {notice && <p className="wfs-secure-notice" role="status">{notice}</p>}
          {budget && <div className="wfs-secure-budget" aria-label="Budget proyek">
            <b>{budget.approved ? 'Approved' : 'Belum disetujui'}</b>
            <span>Cap: {budget.cap_microusd.toLocaleString('id-ID')} µUSD</span>
            <span>Sisa: {budget.remaining_microusd.toLocaleString('id-ID')} µUSD</span>
          </div>}
          {jobs !== null && <div className="wfs-secure-inspector" aria-label="Inspeksi backend nyata">
            <div>
              <button className="btn" onClick={() => act('preview')} disabled={busy}>
                Periksa preview read-only
              </button>
              <button className="btn" onClick={() => act('invoice')} disabled={busy}>
                Audit invoice proyek
              </button>
            </div>
            {previewCheck && <p role="status">
              Preview health: {previewCheck.ok ? 'server terhubung' : 'server belum sehat'}.
              Ini bukan preview kode AI yang baru dibuat.
            </p>}
            {invoiceCheck && <p role="status">
              Rekonsiliasi lokal: {invoiceCheck.matched} cocok;
              {' '}{invoiceCheck.requires_review} butuh pemeriksaan.
              Invoice provider resmi: {invoiceCheck.provider_invoice_verified ? 'terverifikasi' : 'belum diverifikasi'}.
            </p>}
            {evidence && <div aria-label="Manifest QA terverifikasi">
              <strong>Hasil QA: {evidence.tests_passed} tes lulus</strong>
              {evidence.files.map(f => (
                <p key={f.path}><code>{f.path}</code> · SHA256: <code>{f.sha256}</code></p>
              ))}
            </div>}
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
                    {job.status === 'completed' &&
                      <button className="btn" disabled={busy}
                        onClick={() => act('evidence', job.id)}>Bukti QA</button>}
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
