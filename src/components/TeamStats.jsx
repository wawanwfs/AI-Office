import { clip } from '../lib/clip.js'
import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { fileCount } from '../lib/files'
import { IconStats, IconClose } from './Icons'
import { computeTeamStats, teamPresenceSummary } from '../scene/parts/team_spec.js'

// Animasi angka: lerp dengan easing untuk feedback visual yang hidup (tanpa lib tambahan).
function useTween(target, ms = 550) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf
    if (target === v) { setV(target); return }
    const start = performance.now(), from = v
    const step = t => {
      const p = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      setV(Math.round(from + (target - from) * e))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return v
}

/* Statistik Tim — data nyata dari task engine + resource host */
export default function TeamStats() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(false)
  const box = useRef(null)
  useModalFlag(open)
  // rid guard poll out-of-order (pola TaskBoard siklus 131): interval 15 dtk tak
  // membatalkan poll tasks in-flight sebelumnya — respons LAMA tiba belakangan
  // tak menimpa data BARU; kegagalan poll basi tak menaikkan banner offline palsu.
  const loadRid = useRef(0)
  // onClose stabil (ref + useCallback): panel polling tiap 15 dtk — inline closure
  // membuat effect useDialogA11y re-run tiap render dan cleanup-nya melempar fokus
  // ke tombol ✕ berulang (pola bug sama dgn WfsPanel/ProjectPanel).
  const onCloseRef = useRef(() => setOpen(false))
  const closeStats = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open, onClose: closeStats, ref: box })

  const load = useCallback(async (signal) => {
    const rid = ++loadRid.current
    try {
      const d = await api('tasks', { signal })
      if (rid !== loadRid.current) return // poll lebih baru / panel ditutup — basi, abaikan
      setData(d.tasks || []); setErr(false)
    } catch (e) { if (e.name !== 'AbortError' && rid === loadRid.current) setErr(true) }
    try { setRes(await api('system/resources', { signal })) } catch { /* abaikan */ }
  }, [])

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    const t0 = setTimeout(() => load(ac.signal), 0)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(ac.signal) }, 15000)
    const k = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', k)
    return () => { ac.abort(); clearTimeout(t0); clearInterval(iv); document.removeEventListener('keydown', k);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- bump rid saat cleanup memang disengaja (guard async), bukan membaca snapshot ref
      loadRid.current++ }
  }, [open, load])

  // Siklus 150: kehadiran LIVE anggota tim dari scene (window.__agentData) —
  // poll 4 dtk hanya saat panel terbuka (pola sceneAgents SysMeter; scene
  // absen/UI-only → null, chip kehadiran disembunyikan per kartu).
  const [presence, setPresence] = useState(null)
  useEffect(() => {
    if (!open) return
    const read = () => setPresence(teamPresenceSummary(window.__agentData))
    read()
    const iv = setInterval(read, 4000)
    return () => clearInterval(iv)
  }, [open])

  const byStatus = {}
  let totalFiles = 0
  ;(data || []).forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; totalFiles += fileCount(t.files) })
  const teamStats = data && data.length > 0 ? computeTeamStats(data) : []
  const dot = s => s === 'done' ? '#10E5A0' : s === 'failed' ? '#f66' : s === 'running' ? '#f59e0b' : s === 'review' ? '#60A5FA' : '#9aa3b5'
  // Hook tween DIPANGGIL tanpa syarat (5 baris tetap) agar urutan hook stabil antar render.
  const nDone = useTween(byStatus.done || 0)
  const nRunning = useTween(byStatus.running || 0)
  const nReview = useTween(byStatus.review || 0)
  const nFailed = useTween(byStatus.failed || 0)
  const nPending = useTween(byStatus.pending || 0)
  const TW = { done: nDone, running: nRunning, review: nReview, failed: nFailed, pending: nPending }

  return (
    <>
      {open && (
        <div ref={box} id="team-stats" className="panel left" role="dialog" aria-label="Statistik tim" aria-modal="true">
          <div className="ph">
            <div className="t">Statistik Tim<small>task engine · refresh 15 dtk</small></div>
            <button className="x" onClick={() => setOpen(false)} aria-label="Tutup statistik" title="Tutup statistik (Esc)">
              <IconClose size={18} />
              <span className="sr-only">✕</span>
            </button>
          </div>
          <div style={{ padding: '4px 14px 14px', overflowY: 'auto' }} aria-live="polite">
            {!data && !err && <div className="skeleton" role="status">Memuat statistik…</div>}
            {err && <div role="alert" className="msg err" style={{ maxWidth: '100%', marginBottom: 8 }}>Gateway offline. <button className="btn" style={{ minHeight: 32, marginLeft: 6 }} onClick={() => load()}>Coba lagi</button></div>}
            {data && data.length === 0 && <div className="skeleton">Belum ada task. Klik ＋ Task untuk membuat.</div>}
            {data && data.length > 0 && (
              <>
                <div className="stat-grid">
                  {[['done','Selesai'],['running','Jalan'],['review','Review'],['failed','Gagal'],['pending','Antri']].map(([s,l]) => (
                    <div key={s} role="img" aria-label={`${byStatus[s] || 0} task ${l.toLowerCase()}`}>
                      <b style={{color:dot(s)}} aria-hidden="true">{TW[s]}</b>
                      <span aria-hidden="true">{l}</span>
                    </div>
                  ))}
                </div>
                <div className="note" style={{ marginBottom: 6 }}>Total file dihasilkan: <b style={{ color: '#fff' }}>{totalFiles}</b></div>
                {/* Progres Per Divisi / Tim Kerja & Pod Meja 3D */}
                {teamStats.length > 0 && (
                  <div style={{ marginTop: 8, marginBottom: 12 }}>
                    <div className="note" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontWeight: 700, color: '#cfd8e3' }}>
                      <span>Progres Divisi & Pod 3D</span>
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>klik kartu untuk fokus 3D</span>
                    </div>
                    <div className="team-progress-list" role="region" aria-label="Progres per divisi kerja">
                      {teamStats.map((team) => (
                        <div
                          key={team.key}
                          className="team-card"
                          role="button"
                          tabIndex={0}
                          onClick={() => { if (typeof window !== 'undefined' && window.__focusTeam) window.__focusTeam(team.key) }}
                          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && typeof window !== 'undefined' && window.__focusTeam) { e.preventDefault(); window.__focusTeam(team.key) } }}
                          aria-label={`${team.name}: ${team.done}/${team.total} task selesai (${team.pct}%)`}
                          title={`Klik untuk fokus kamera 3D ke pod ${team.name} (Lantai ${team.floor})`}
                        >
                          <div className="team-card-header">
                            <div className="team-card-title">
                              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: team.color }} />
                              <span>{team.name}</span>
                              <span className="team-card-tag">Lt. {team.floor}</span>
                              {team.running > 0 && <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,.2)', color: '#F59E0B', fontWeight: 700 }}>● {team.running} jalan</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <button
                                type="button"
                                className="team-kanban-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { division: team.key, view: 'kanban' } }))
                                }}
                                aria-label={`Buka kanban divisi ${team.name}`}
                                title={`Buka papan kanban sprint untuk divisi ${team.name}`}
                              >
                                Kanban
                              </button>
                              <button
                                type="button"
                                className="team-focus-btn"
                                onClick={(e) => { e.stopPropagation(); if (typeof window !== 'undefined' && window.__focusTeam) window.__focusTeam(team.key) }}
                                aria-label={`Fokus kamera ke pod ${team.name}`}
                                title={`Fokus kamera 3D ke pod ${team.name}`}
                              >
                                Fokus 3D
                              </button>
                            </div>
                          </div>
                          <div className="team-progress-bar">
                            <div
                              className="team-progress-fill"
                              style={{
                                width: `${team.pct}%`,
                                background: `linear-gradient(90deg, ${team.color}, #448AFF)`,
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                            <span className="team-members-sub">Lead: {team.lead} · {(team.members || []).length} agen</span>
                            <b style={{ color: team.pct === 100 ? '#10E5A0' : team.color }}>{team.done}/{team.total} ({team.pct}%)</b>
                          </div>
                          {/* Siklus 150: kehadiran LIVE anggota di pod — paritas
                              Ticker 149 (satu sumber agentLiveStatus). null =
                              scene absen → baris disembunyikan, bukan angka palsu. */}
                          {(() => {
                            const pr = presence && presence.find(p => p.key === team.key)
                            if (!pr || pr.total === 0) return null
                            return (
                              <div className="team-presence" title={`Kehadiran live pod ${team.name} dari scene 3D`}>
                                <span className="team-presence-desk" aria-hidden="true">
                                  <i style={{ background: '#10E5A0' }} />{pr.atDesk}/{pr.total} di pod
                                </span>
                                {pr.away > 0 && pr.awayLabel && (
                                  <span className="team-presence-away" aria-hidden="true">{pr.awayLabel}</span>
                                )}
                                <span className="sr-only">
                                  Kehadiran live: {pr.atDesk} dari {pr.total} anggota di pod{pr.away > 0 && pr.awayLabel ? ` — ${pr.away} lain: ${pr.awayLabel}` : ''}
                                </span>
                              </div>
                            )
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <label className="note" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Task Terkini</label>
                <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {data.slice(-8).reverse().map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="taskrow"
                      style={{
                        padding: '6px 8px',
                        borderLeft: `3px solid ${dot(t.status)}`,
                        textAlign: 'left',
                        cursor: 'pointer',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 6,
                        color: '#fff',
                        fontFamily: 'inherit',
                      }}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { taskId: t.id, view: 'kanban' } }))
                      }}
                      title={`Buka detail task #${t.id} di papan kanban`}
                      aria-label={`Task #${t.id}: ${t.title}`}
                    >
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#e2e8f0' }}>#{t.id} {clip(t.title, 32)}</div>
                      <div className="note" style={{ fontSize: 11, marginTop: 2 }}>
                        {t.agent_id} · <span style={{ color: dot(t.status), fontWeight: 600 }}>{t.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {res && (
              <div style={{ marginTop: 10, background: 'rgba(255,255,255,.05)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
                <div style={{ color: '#10E5A0', fontWeight: 700, marginBottom: 4 }}>🖥 HOST: load {res.load} · RAM {res.ram_mb} MB</div>
                {(res.containers || []).slice(0, 9).map(c => (
                  <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', color: 'var(--text-tertiary)' }}>
                    <span>{c.name.replace('saas-dibantuin-', '').replace('wfs-sandbox-', '').replace('wfs-agent-', 'sbx-')}</span>
                    <span style={{ color: '#fff' }}>{c.cpu} · {c.mem}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="note" style={{ marginTop: 10 }}>refresh 15 detik</div>
          </div>
        </div>
      )}
      <button className="ibtn" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="team-stats" aria-label="Statistik tim" title="Statistik & performa tim">
        <span className="ic"><IconStats size={19} /><span className="sr-only">📊</span></span><span className="lb">Statistik</span>
      </button>
    </>
  )
}
