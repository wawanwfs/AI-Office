import React, { useState } from 'react'

const FLOORS = [
  {
    num: 1,
    id: 'l1',
    name: 'L1 · Ops & AI',
    shortName: 'L1',
    roleLabel: 'Datacenter, AI Lab & Tech Ops',
    color: '#F59E0B',
    desc: 'Bantuin AI, Budi, Andi, Rina, Trainer AI',
    agents: ['Bantuin AI', 'Budi', 'Andi', 'Rina', 'Trainer AI']
  },
  {
    num: 2,
    id: 'l2',
    name: 'L2 · Engineering',
    shortName: 'L2',
    roleLabel: 'Core Engineering & Product Studio',
    color: '#00F0FF',
    desc: 'Rizky, Dewi, Yoga, Lina, Integrator Bot',
    agents: ['Rizky', 'Dewi', 'Yoga', 'Lina', 'Integrator Bot']
  },
  {
    num: 3,
    id: 'l3',
    name: 'L3 · Executive',
    shortName: 'L3',
    roleLabel: 'Executive Penthouse & Founder Suite',
    color: '#10E5A0',
    desc: 'Wahyu FS (Founder), Maya, Toni, Sari, Support Human · Papan Proyek 3D',
    agents: ['Wahyu FS', 'Maya', 'Toni', 'Sari', 'Support']
  }
]

export default function FloorNavigator({ onSelectFloor, currentFloor = 1 }) {
  const [selectedFloor, setSelectedFloor] = useState(null)
  const activeFloor = selectedFloor ?? currentFloor

  const handleFloorClick = (fl) => {
    setSelectedFloor(fl.num)
    if (onSelectFloor) {
      onSelectFloor(fl.num, fl.id)
    }
  }

  return (
    <div
      className="floor-nav"
      role="navigation"
      aria-label="Navigasi Lantai Kantor WFS PROJECT"
    >
      <div className="floor-nav-label">
        LANTAI
      </div>
      <div className="floor-nav-buttons">
        {FLOORS.map(fl => {
          const isActive = activeFloor === fl.num
          return (
            <button
              key={fl.num}
              type="button"
              className={`floor-nav-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleFloorClick(fl)}
              title={`Level 0${fl.num}: ${fl.roleLabel}\nTim: ${fl.desc}`}
              aria-label={`Fokus ke ${fl.roleLabel}`}
              aria-pressed={isActive}
              style={{
                borderColor: isActive ? fl.color : undefined,
                boxShadow: isActive ? `0 0 10px ${fl.color}40` : undefined
              }}
            >
              <span className="floor-nav-dot" style={{ background: fl.color }} />
              <span>{fl.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
