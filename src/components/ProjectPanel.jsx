import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { IconRocket, IconClose } from './Icons'
import { normalizeTaskStatus, formatTaskId } from '../scene/parts/projectboard_data'

// Panel Proyek Nyata: data live dibantuin.com dari endpoint /wfs-project (server 9503).
// Semua data diambil server-side — tidak ada kredensial di frontend.
const ST = { done: ['Selesai', '#10E5A0'], running: ['Jalan', '#F59E0B'], review: ['Review', '#448AFF'], failed: ['Gagal', '#ef4444'], pending: ['Antri', '#9aa7b8'] }

export default function ProjectPanel() {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useModalFlag(open)
  // onClose stabil (useCallback + ref): inline closure membuat effect useDialogA11y
  // re-run tiap render — panel ini re-render tiap 15 dtk dari polling /wfs-project,
  // cleanup-nya memindahkan fokus ke tombol ✕ berulang (pola bug sama dgn WfsPanel).
  const onCloseRef = useRef(() => setOpen(false))
  const closePanel = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open, onClose: closePanel, ref: box })
  const [d, setD] = useState(null)
  const [err, setErr] = useState(false)

  const load = useCallback(async (signal) => {
    try {
      const r = await fetch('/wfs-project', { signal })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      setD(await r.json()); setErr(false)
    } catch (e) { if (e.name !== 'AbortError') setErr(true) }
  }, [])

  useEffect(() => {
    const handleOpen = () => setOpen(true)
    const handleToggle = () => setOpen(v => !v)
    window.addEventListener('wfs-open-project-panel', handleOpen)
    window.addEventListener('wfs-toggle-project-panel', handleToggle)
    return () => {
      window.removeEventListener('wfs-open-project-panel', handleOpen)
      window.removeEventListener('wfs-toggle-project-panel', handleToggle)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    const t0 = setTimeout(() => load(ac.signal), 0)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(ac.signal) }, 15000)
    const k = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', k)
    return () => { ac.abort(); clearTimeout(t0); clearInterval(iv); document.removeEventListener('keydown', k) }
  }, [open, load])

  const T = d?.tasks || {}
  const S = d?.saas || {}
  const pct = T.total ? Math.round((T.done / T.total) * 100) : 0

  return (
    <>
      <button className="ibtn" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="project-panel" aria-label="Proyek dibantuin.com" title="Ringkasan proyek live dibantuin.com — shortcut P">
        <span className="ic"><IconRocket size={19} /><span className="sr-only">🚀</span></span><span className="lb">Proyek</span>
      </button>
      {open && (
        <section ref={box} id="project-panel" className="panel left" role="dialog" aria-label="Proyek dibantuin.com" aria-modal="true">
          <div className="ph">
            <div className="t">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconRocket size={16} style={{ color: 'var(--cyan)' }} />
                <span>Proyek: dibantuin.com</span>
              </span>
              <small>{err ? 'gagal memuat' : 'data live · refresh 15 dtk'}</small>
            </div>
            <button className="x" onClick={() => setOpen(false)} aria-label="Tutup panel proyek" title="Tutup panel proyek (Esc)">
              <IconClose size={18} />
              <span className="sr-only">✕</span>
            </button>
          </div>
          <div style={{ padding: '12px 14px', overflowY: 'auto' }}>
            {err && <div className="msg err" role="alert">Gagal memuat data proyek. <button className="btn" onClick={() => load()}>Coba lagi</button></div>}
            {!d && !err && <div className="skeleton">Memuat data proyek…</div>}
            {d && (
              <>
                {/* Progres task engine */}
                <div style={{ marginBottom: 14 }}>
                  <div className="note" style={{ marginBottom: 4 }}>Progres pengerjaan — {T.done}/{T.total} task selesai ({pct}%)</div>
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Progres task: ${pct}% selesai`}
                    style={{ height: 10, background: 'rgba(255,255,255,.08)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: pct + '%', background: 'linear-gradient(90deg,#10E5A0,#448AFF)', borderRadius: 6, transition: 'width .6s' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {Object.entries(ST).map(([k, [l, c]]) => T[k] > 0 && (
                      <span key={k} className="note" style={{ color: c, fontWeight: 600 }}>{l}: {T[k]}</span>
                    ))}
                  </div>
                </div>

                {/* Task terbaru */}
                <label className="note">Task terakhir dikerjakan</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '6px 0 14px' }}>
                  {(T.recent || []).map(x => {
                    const normSt = normalizeTaskStatus(x.status)
                    const isDone = normSt === 'done'
                    const stColor = ST[normSt]?.[1] || (isDone ? '#10E5A0' : '#888')
                    const displayId = formatTaskId(x.id)
                    return (
                      <button
                        key={x.id}
                        type="button"
                        className="taskrow"
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'baseline',
                          color: '#cfd8e3',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 6,
                          padding: '6px 8px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { taskId: x.id, view: 'kanban' } }))
                        }}
                        title={`Buka task ${displayId} di papan sprint kanban`}
                        aria-label={`Task ${displayId}: ${x.title}`}
                      >
                        <span style={{ color: stColor, fontWeight: 700 }}>{isDone ? '✓' : '•'}</span>
                        <span style={{ fontSize: 12.5, flex: 1 }}>{displayId} {x.title}</span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban' } }))
                    }}
                    title="Buka seluruh task di Papan Kanban Sprint"
                    aria-label="Buka seluruh task di Papan Kanban Sprint"
                  >
                    <span>📋 Buka Papan Sprint Kanban ↗</span>
                  </button>
                </div>

                {/* SaaS live */}
                <label className="note">Produk SaaS (live)</label>
                {S.online ? (
                  <div style={{ background: 'rgba(16,229,160,.08)', border: '1px solid rgba(16,229,160,.25)', borderRadius: 10, padding: '8px 12px', margin: '6px 0 14px' }}>
                    <div className="note" style={{ color: '#10E5A0', fontWeight: 600 }}>● Backend online</div>
                    <div className="note" style={{ marginTop: 4 }}>
                      {S.stats?.tenants ?? 0} tenant · {S.stats?.conversations ?? 0} percakapan · {S.stats?.messages ?? 0} pesan
                    </div>
                    <div className="note" style={{ marginTop: 4 }}>
                      Tenant: {(S.tenants || []).map(t => t.name).join(', ') || '—'}
                    </div>
                  </div>
                ) : (
                  <div className="msg err" style={{ margin: '6px 0 14px' }}>Backend SaaS tidak merespons</div>
                )}

                {/* Sandbox agent */}
                <label className="note">Sandbox agent</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(d.agents || []).map(a => (
                    <span key={a.name} className="note" style={{
                      background: a.status === 'Up' ? 'rgba(16,229,160,.12)' : 'rgba(239,68,68,.12)',
                      color: a.status === 'Up' ? '#10E5A0' : '#ef4444',
                      border: `1px solid ${a.status === 'Up' ? 'rgba(16,229,160,.3)' : 'rgba(239,68,68,.3)'}`,
                      borderRadius: 8, padding: '3px 10px', fontWeight: 600,
                    }}>{a.status === 'Up' ? '●' : '○'} {a.name}</span>
                  ))}
                  {!(d.agents || []).length && <span className="note">Tidak ada agent aktif</span>}
                </div>

                {/* OmniRoute Router AI */}
                {d.omniroute && (
                  <div style={{ marginTop: 14 }}>
                    <label className="note">AI Router (OmniRoute)</label>
                    <div style={{
                      background: d.omniroute.online ? 'rgba(13,238,243,.08)' : 'rgba(239,68,68,.12)',
                      border: `1px solid ${d.omniroute.online ? 'rgba(13,238,243,.25)' : 'rgba(239,68,68,.3)'}`,
                      borderRadius: 10, padding: '8px 12px', marginTop: 6,
                    }}>
                      <div className="note" style={{ color: d.omniroute.online ? 'var(--teal)' : '#ef4444', fontWeight: 600 }}>
                        {d.omniroute.online ? '● OmniRoute Online (Port 20128)' : '○ OmniRoute Offline'}
                      </div>
                      <div className="note" style={{ marginTop: 2 }}>
                        Multi-model AI router aktif di container Docker
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <footer className="panel-footer-hints" role="note" aria-label="Petunjuk pintasan keyboard">
            <span className="hint-item"><kbd className="hint-kbd">Esc</kbd> Tutup</span>
            <span className="hint-item"><kbd className="hint-kbd">P</kbd> Toggle Panel</span>
          </footer>
        </section>
      )}
    </>
  )
}
