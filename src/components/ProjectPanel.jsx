import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { IconRocket, IconClose } from './Icons'
import GlobalTaskComposer from './GlobalTaskComposer'
import ProjectWorkspaceModal from './ProjectWorkspaceModal'

export default function ProjectPanel() {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useModalFlag(open)

  const onCloseRef = useRef(() => setOpen(false))
  const closePanel = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open, onClose: closePanel, ref: box })

  const [projects, setProjects] = useState([])
  const [stats, setStats] = useState(null)
  const [err, setErr] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [selectedWorkspaceProj, setSelectedWorkspaceProj] = useState(null)

  const loadData = useCallback(async (signal) => {
    try {
      const [projRes, statsRes] = await Promise.all([
        fetch('/api/projects', { signal }),
        fetch('/api/dashboard/stats', { signal })
      ])
      if (projRes.ok) {
        const pd = await projRes.json()
        setProjects(pd.projects || [])
      }
      if (statsRes.ok) {
        setStats(await statsRes.json())
      }
      setErr(false)
    } catch (e) {
      if (e.name !== 'AbortError') setErr(true)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    const t0 = setTimeout(() => loadData(ac.signal), 0)
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') loadData(ac.signal)
    }, 10000)
    const k = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', k)
    return () => {
      clearTimeout(t0)
      ac.abort()
      clearInterval(iv)
      document.removeEventListener('keydown', k)
    }
  }, [open, loadData])

  const runningCount = projects.filter(p => p.status === 'running').length
  const totalCount = projects.length

  return (
    <>
      <button
        className="ibtn"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls="project-panel"
        aria-label="WFS Project Software House"
        title="Buka panel proyek WFS Software House"
      >
        <span className="ic"><IconRocket size={19} /><span className="sr-only">🚀</span></span>
        <span className="lb">Proyek</span>
      </button>

      {open && (
        <section
          ref={box}
          id="project-panel"
          className="panel left"
          role="dialog"
          aria-label="WFS Project Software House"
          aria-modal="true"
          style={{ width: 'min(440px, 95vw)', zIndex: 110 }}
        >
          {/* Header */}
          <div className="ph" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="t">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconRocket size={16} style={{ color: 'var(--cyan)' }} />
                <span style={{ fontWeight: 700, letterSpacing: '0.03em' }}>WFS PROJECT</span>
              </span>
              <small style={{ color: 'var(--text-muted)' }}>Software House · Docker Sandbox</small>
            </div>
            <button
              className="x"
              onClick={() => setOpen(false)}
              aria-label="Tutup panel proyek"
              title="Tutup panel proyek (Esc)"
            >
              <IconClose size={18} />
              <span className="sr-only">✕</span>
            </button>
          </div>

          <div style={{ padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && (
              <div className="msg err">
                Gagal memuat status proyek. <button className="btn" onClick={() => loadData()}>Coba lagi</button>
              </div>
            )}

            {/* Quick Stats Banner */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>DOCKER RUNTIMES</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#F8FAFC' }}>
                  {runningCount} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748B' }}>/ {totalCount} Aktif</span>
                </div>
              </div>
              <button
                className="btn primary"
                onClick={() => setShowComposer(true)}
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  background: '#10E5A0',
                  color: '#0B0F17'
                }}
              >
                + Beri Tugas Baru
              </button>
            </div>

            {/* Projects List */}
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 8, textTransform: 'uppercase' }}>
                Daftar Proyek Software House
              </div>

              {projects.length === 0 ? (
                <div style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 12,
                  border: '1px dashed rgba(255,255,255,0.1)'
                }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>⚡</div>
                  <div style={{ color: '#F8FAFC', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Belum ada proyek</div>
                  <p style={{ color: '#94A3B8', fontSize: 11, marginBottom: 12 }}>
                    Beri tugas baru untuk membiarkan AI agents membangun website atau aplikasi di Docker sandbox.
                  </p>
                  <button className="btn primary" onClick={() => setShowComposer(true)}>
                    Mulai Proyek Pertama
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projects.map(p => (
                    <div
                      key={p.id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.45)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, color: '#F8FAFC', fontSize: 13 }}>{p.name}</span>
                        <span style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 99,
                          fontFamily: 'monospace',
                          background: p.status === 'running' ? 'rgba(16, 229, 160, 0.15)' : 'rgba(255,255,255,0.08)',
                          color: p.status === 'running' ? '#10E5A0' : '#94A3B8',
                          border: p.status === 'running' ? '1px solid rgba(16, 229, 160, 0.3)' : '1px solid rgba(255,255,255,0.1)'
                        }}>
                          {p.status?.toUpperCase() || 'READY'}
                        </span>
                      </div>

                      <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.description || p.project_type}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748B' }}>
                          {p.preview_port ? `PORT: ${p.preview_port}` : 'SANDBOX READY'}
                        </span>

                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn sm"
                            onClick={() => setSelectedWorkspaceProj(p)}
                            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6 }}
                          >
                            Workspace
                          </button>
                          {p.preview_url && (
                            <a
                              href={p.preview_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn sm primary"
                              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, textDecoration: 'none' }}
                            >
                              Live Preview ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Execution Activity */}
            {stats?.logs && stats.logs.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 6, textTransform: 'uppercase' }}>
                  Aktivitas Eksekusi Agen Terbaru
                </div>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  maxHeight: 120,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}>
                  {stats.logs.slice(0, 5).map((l, i) => (
                    <div key={i} style={{ color: l.level === 'ERROR' ? '#F87171' : l.level === 'SUCCESS' ? '#34D399' : '#CBD5E1' }}>
                      <span style={{ color: '#64748B' }}>[{l.level}]</span> {l.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Global Task Composer Dialog */}
      <GlobalTaskComposer
        open={showComposer}
        onClose={() => setShowComposer(false)}
        onProjectCreated={() => {
          loadData()
          setShowComposer(false)
        }}
      />

      {/* Project Workspace Modal */}
      <ProjectWorkspaceModal
        project={selectedWorkspaceProj}
        open={!!selectedWorkspaceProj}
        onClose={() => setSelectedWorkspaceProj(null)}
        onRefreshProject={() => loadData()}
      />
    </>
  )
}
