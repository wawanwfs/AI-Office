import React, { useEffect } from 'react'
import { IconClose, IconChat, IconUser } from './Icons'

// Kartu Inspektur Agen Interaktif — Tampil saat agen 3D diklik di ruangan
export default function AgentInspector({ agent, onClose, onChatWith }) {
  useEffect(() => {
    if (!agent) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [agent, onClose])

  if (!agent) return null

  return (
    <aside
      className="agent-inspector panel"
      role="region"
      aria-label={`Profil ${agent.name}`}
      style={{
        position: 'fixed',
        right: 18,
        top: 116,
        bottom: 'auto',
        width: 'min(330px, calc(100vw - 36px))',
        zIndex: 'var(--z-panel)',
        animation: 'fadeUp .25s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <div className="ph" style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${agent.hex || '#0DEEF3'}, rgba(13,238,243,0.3))`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#020713',
              fontWeight: 800,
              fontSize: 16,
              boxShadow: `0 0 16px ${agent.hex || '#0DEEF3'}44`,
            }}
          >
            {agent.name ? agent.name.slice(0, 2).toUpperCase() : <IconUser size={18} />}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: 0.3 }}>
              {agent.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500, marginTop: 1 }}>
              {agent.role || 'AI Specialist'}
            </div>
          </div>
        </div>
        <button
          className="x"
          onClick={onClose}
          aria-label="Tutup kartu agen"
          title="Tutup profil agen (Esc)"
          style={{ minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <IconClose size={16} />
        </button>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Status Chip & Lokasi Lantai */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '8px 10px' }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 }}>Status</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
              <i style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
              Aktif Bekerja
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '8px 10px' }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 3 }}>Lokasi Lantai</span>
            <div style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>
              {agent.floor ? `L${agent.floor} · ${agent.floor === 1 ? 'Ops & AI' : agent.floor === 2 ? 'Engineering' : 'Executive'}` : 'L3 · Penthouse'}
            </div>
          </div>
        </div>

        {/* AI Engine, Proyek & Sandbox */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            <span>Proyek</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>WFS PROJECT</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            <span>Model AI</span>
            <span style={{ color: 'var(--teal)', fontWeight: 600 }}>OmniRoute / GLM-5</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span>Runtime</span>
            <span style={{ color: '#fff', fontWeight: 500 }}>Docker Sandbox</span>
          </div>
        </div>

        {/* Quick Actions */}
        <button
          className="btn primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            fontWeight: 700,
          }}
          onClick={() => {
            if (onChatWith) onChatWith(agent)
            onClose()
          }}
        >
          <IconChat size={16} />
          Buka Chat dengan {agent.name.split(' ')[0]}
        </button>
      </div>
    </aside>
  )
}
