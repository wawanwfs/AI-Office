import React, { useEffect, useState } from 'react'
import { IconClose, IconChat, IconUser } from './Icons'
import { getAgentCompetency } from '../scene/parts/agent_competencies.js'
import { resolveAgentId } from '../scene/parts/running_tasks.js'
import { findTeamByAgent } from '../scene/parts/team_spec.js'
import { agentLiveStatus, findAgentLiveEntry, agentLiveLevel, floorZoneName } from '../scene/parts/agent_status.js'

// Kartu Inspektur Agen Interaktif — Tampil saat agen 3D diklik di ruangan
export default function AgentInspector({ agent, onClose, onChatWith, onFocusFloor, onOpenConsole }) {
  // Status live dari state machine scene (window.__agentData). Dulu HARDCODED
  // "Aktif Bekerja" utk semua agen — agen rapat/makan siang/berjalan tetap
  // dilabeli bekerja. Polling 1 dtk selama kartu terbuka: agen berjalan antar
  // lantai berpindah status tanpa perlu membuka ulang kartu.
  const [live, setLive] = useState(null)
  // Lantai LIVE (siklus 142): dulu badge "Lokasi Lantai" statis dari agent.floor
  // (posisi MEJA saat scene build) — agen rapat (L1), makan siang kafe (L3),
  // jalan kampus, pulang tetap dilabeli lantai meja → tombol FOKUS membawa kamera
  // ke lantai kosong. Kini dibaca dari posisi karakter scene tiap polling.
  const [liveFloor, setLiveFloor] = useState(null)
  useEffect(() => {
    if (!agent) return undefined
    const read = () => {
      const entry = findAgentLiveEntry(window.__agentData, agent && agent.name)
      setLive(agentLiveStatus(entry))
      setLiveFloor(agentLiveLevel(entry))
    }
    read()
    const iv = setInterval(read, 1000)
    return () => clearInterval(iv)
  }, [agent])
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

  const comp = getAgentCompetency(agent)
  const runningByAgent = window.__wfsRunningTasks?.byAgent || {}
  const agentGid = resolveAgentId(agent.name, window.__wfsAgentIdList)
  const activeTask = agentGid ? runningByAgent[agentGid] : null
  const isFounder = comp.isFounder || agent.name === 'Wahyu FS'

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
              background: `linear-gradient(135deg, ${agent.hex || '#4D9FFF'}, rgba(77,159,255,0.3))`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#020713',
              fontWeight: 800,
              fontSize: 16,
              boxShadow: `0 0 16px ${agent.hex || '#4D9FFF'}44`,
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
            {(() => {
              // Status live dari state machine scene; scene belum ada → Standby (bukan klaim palsu)
              const st = live || agentLiveStatus(null)
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: st.hex, fontWeight: 600 }}>
                  <i style={{ width: 6, height: 6, borderRadius: '50%', background: st.hex, boxShadow: `0 0 8px ${st.hex}` }} />
                  {st.label}
                </div>
              )
            })()}
          </div>
          <button
            type="button"
            className="agent-floor-badge-btn"
            onClick={() => onFocusFloor && onFocusFloor(liveFloor || agent.floor || (isFounder ? 3 : 1))}
            title={`Fokus kamera ke Lantai ${liveFloor || agent.floor || (isFounder ? 3 : 1)}`}
            aria-label={`Fokus kamera ke Lantai ${liveFloor || agent.floor || (isFounder ? 3 : 1)}`}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '8px 10px',
              textAlign: 'left',
              cursor: onFocusFloor ? 'pointer' : 'default',
              transition: 'background .15s, border-color .15s',
              color: 'inherit',
              font: 'inherit',
            }}
            onMouseEnter={(e) => {
              if (onFocusFloor) {
                e.currentTarget.style.borderColor = 'var(--teal)'
                e.currentTarget.style.background = 'rgba(0,240,255,0.08)'
              }
            }}
            onMouseLeave={(e) => {
              if (onFocusFloor) {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span>Lokasi Lantai</span>
              {onFocusFloor && <span style={{ fontSize: 9, color: 'var(--teal)', fontWeight: 700 }}>FOKUS ↗</span>}
            </span>
            <div style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>
              {liveFloor
                ? `L${liveFloor} · ${floorZoneName(liveFloor)}`
                : (agent.floor ? `L${agent.floor} · ${agent.floor === 1 ? 'Ops & AI' : agent.floor === 2 ? 'Engineering' : 'Executive'}` : (isFounder ? 'L3 · Executive' : 'L3 · Penthouse'))}
            </div>
          </button>
        </div>

        {/* Live Active Task (bila ada task aktif yang dikerjakan) */}
        {activeTask && activeTask.id && activeTask.id !== '?' ? (
          <button
            type="button"
            className="agent-active-task-btn"
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('wfs-open-task-board', {
                  detail: { taskId: activeTask.id, view: 'kanban' }
                }))
              } catch { /* ignore */ }
              onClose()
            }}
            title={`Buka task #${activeTask.id} di Papan Kanban`}
            aria-label={`Mengerjakan Task #${activeTask.id}: ${activeTask.title}. Klik untuk buka detail di Papan Kanban.`}
            style={{
              textAlign: 'left',
              width: '100%',
              background: 'rgba(16,229,160,0.08)',
              border: '1px solid rgba(16,229,160,0.25)',
              borderRadius: 12,
              padding: '10px 12px',
              cursor: 'pointer',
              color: 'inherit',
              font: 'inherit',
              transition: 'background .15s, border-color .15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
                Mengerjakan Task #{activeTask.id}
              </div>
              <span style={{ fontSize: 9.5, color: 'var(--teal)', fontWeight: 700 }}>KANBAN ↗</span>
            </div>
            <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, lineHeight: 1.35 }}>
              {activeTask.title}
            </div>
          </button>
        ) : null}

        {/* Profil Kompetensi & Stack Teknologi */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Kompetensi & Spesialisasi
          </div>
          <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, marginBottom: 4 }}>
            {comp.domain}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 8 }}>
            {comp.summary}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {comp.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '2px 7px',
                  color: '#cbd5e1',
                  fontWeight: 500,
                }}
              >
                {tag}
              </span>
            ))}
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
        {isFounder && onOpenConsole && (
          <button
            type="button"
            className="btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              fontWeight: 700,
              background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.3)',
              color: '#F59E0B',
              borderRadius: 8,
              padding: '8px 12px',
            }}
            onClick={() => {
              onOpenConsole()
              onClose()
            }}
            title="Buka konsol manajemen proyek software house WFS"
          >
            🖥️ Buka Konsol Software House
          </button>
        )}

        <button
          type="button"
          className="btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            fontWeight: 600,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#cbd5e1',
          }}
          onClick={() => {
            const team = findTeamByAgent(agent.name)
            try {
              window.dispatchEvent(new CustomEvent('wfs-open-task-board', {
                detail: { view: 'kanban', division: team?.key || 'all' }
              }))
            } catch { /* ignore */ }
            onClose()
          }}
          title={`Buka papan sprint kanban untuk divisi ${findTeamByAgent(agent.name)?.name || agent.name}`}
        >
          📋 Papan Kanban {findTeamByAgent(agent.name)?.shortName ? `(${findTeamByAgent(agent.name).shortName})` : ''}
        </button>

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
          Buka Chat dengan {agent.name ? agent.name.split(' ')[0] : 'Agen'}
        </button>
      </div>
    </aside>
  )
}
