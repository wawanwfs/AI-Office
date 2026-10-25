import React, { useState } from 'react'

const FLOORS = [
  {
    num: 1,
    id: 'l1',
    name: 'L1 · Product',
    roleLabel: 'Product & Strategy',
    color: '#F59E0B',
    desc: 'PM · Solution Architect · UI/UX Designer',
    agents: ['Sari', 'Wahyu FS', 'Maya']
  },
  {
    num: 2,
    id: 'l2',
    name: 'L2 · Engineering',
    roleLabel: 'Engineering & Dev',
    color: '#00F0FF',
    desc: 'Frontend · Backend · Database · DevOps',
    agents: ['Andi', 'Budi', 'Rizky', 'Toni']
  },
  {
    num: 3,
    id: 'l3',
    name: 'L3 · Quality',
    roleLabel: 'Quality & Security',
    color: '#10E5A0',
    desc: 'QA Automation · Code Review · Security · Docs',
    agents: ['Rina', 'Dewi', 'SecBot', 'Lina']
  }
]

export default function FloorNavigator({ onSelectFloor, currentFloor = 1 }) {
  const [activeFloor, setActiveFloor] = useState(currentFloor)

  const handleFloorClick = (fl) => {
    setActiveFloor(fl.num)
    if (onSelectFloor) {
      onSelectFloor(fl.num, fl.id)
    }
  }

  return (
    <div
      className="floor-nav"
      role="navigation"
      aria-label="Navigasi Lantai Kantor WFS PROJECT"
      style={{
        position: 'fixed',
        top: 64,
        left: 18,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: 'rgba(13, 21, 34, 0.78)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '6px 8px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)'
      }}
    >
      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary, #9aa3b5)', letterSpacing: 1.2, padding: '2px 6px', textTransform: 'uppercase' }}>
        LANTAI KANTOR
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {FLOORS.map(fl => {
          const isActive = activeFloor === fl.num
          return (
            <button
              key={fl.num}
              onClick={() => handleFloorClick(fl)}
              title={`${fl.roleLabel} — ${fl.desc}`}
              aria-label={`Fokus ke ${fl.roleLabel}`}
              aria-pressed={isActive}
              style={{
                background: isActive ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${isActive ? fl.color : 'rgba(255, 255, 255, 0.06)'}`,
                color: isActive ? '#fff' : 'var(--text-secondary, #cbd5e1)',
                padding: '5px 9px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: fl.color }} />
              <span>{fl.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
