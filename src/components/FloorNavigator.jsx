import React, { useEffect, useState } from 'react'
// Siklus 143: okupansi lantai LIVE — dulu tombol lantai hanya daftar statis
// (pod + nama agen meja), founder tak bisa lihat berapa agen yang SAAT INI ada
// di tiap lantai (rapat L1, kafe L3, jalan kampus memindahkan agen lintas lantai
// terus-menerus). Kini badge jumlah dihitung dari posisi karakter scene
// (window.__agentData via floorOccupancy — satu sumber kebenaran dgn badge
// lantai AgentInspector siklus 142), polling 1 dtk selama komponen terpasang.
// floorOccupancy murni tinggal di scene/parts/agent_status.js (bisa diuji unit,
// aturan react-refresh: file komponen tak mengekspor non-komponen).
import { floorOccupancy } from '../scene/parts/agent_status.js'

const FLOORS = [
  {
    num: 1,
    id: 'l1',
    name: 'L1 · Ops & AI',
    shortName: 'L1',
    roleLabel: 'Datacenter, AI Lab & Architecture Atrium',
    color: '#F59E0B',
    desc: 'Aris, Clara, Rian, Tari, Andi, Budi, Rina, Trainer AI, Bantuin AI',
    agents: ['Aris', 'Clara', 'Rian', 'Tari', 'Bantuin AI', 'Budi', 'Andi', 'Rina', 'Trainer AI']
  },
  {
    num: 2,
    id: 'l2',
    name: 'L2 · Engineering',
    shortName: 'L2',
    roleLabel: 'Core Engineering & Cloud Database Pod',
    color: '#00F0FF',
    desc: 'Ferry, Gilang, Hendra, Doni, Rizky, Dewi, Yoga, Lina, Integrator Bot',
    agents: ['Ferry', 'Gilang', 'Hendra', 'Doni', 'Rizky', 'Dewi', 'Yoga', 'Lina', 'Integrator Bot']
  },
  {
    num: 3,
    id: 'l3',
    name: 'L3 · Executive',
    shortName: 'L3',
    roleLabel: 'Executive Penthouse, Security & Delivery Suite',
    color: '#10E5A0',
    desc: 'SecBot, Citra, Bagas, Nina, Wahyu FS, Maya, Toni, Sari, Support',
    agents: ['SecBot', 'Citra', 'Bagas', 'Nina', 'Wahyu FS', 'Maya', 'Toni', 'Sari', 'Support']
  }
]

export default function FloorNavigator({ onSelectFloor, currentFloor }) {
  const [internalFloor, setInternalFloor] = useState(1)
  // Okupansi lantai live (siklus 143): {1: n, 2: n, 3: n} dari posisi karakter
  // scene; null = scene belum siap (badge disembunyikan — bukan angka karangan).
  const [occupancy, setOccupancy] = useState(null)
  useEffect(() => {
    const read = () => setOccupancy(floorOccupancy(window.__agentData))
    read()
    const iv = setInterval(read, 1000)
    return () => clearInterval(iv)
  }, [])
  const isControlled = currentFloor !== undefined && currentFloor !== null
  const activeFloor = isControlled ? currentFloor : internalFloor

  const handleFloorClick = (fl) => {
    if (!isControlled) {
      setInternalFloor(fl.num)
    }
    if (onSelectFloor) {
      onSelectFloor(fl.num, fl.id)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const nextNum = activeFloor >= 3 ? 1 : activeFloor + 1
      const fl = FLOORS.find(f => f.num === nextNum)
      if (fl) handleFloorClick(fl)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prevNum = activeFloor <= 1 ? 3 : activeFloor - 1
      const fl = FLOORS.find(f => f.num === prevNum)
      if (fl) handleFloorClick(fl)
    }
  }

  return (
    <div
      className="floor-nav"
      role="navigation"
      aria-label="Navigasi Lantai Kantor WFS PROJECT"
      onKeyDown={handleKeyDown}
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
              {occupancy && typeof occupancy[fl.num] === 'number' && (
                <span
                  className="floor-nav-occ"
                  aria-hidden="true"
                  title={`${occupancy[fl.num]} agen saat ini di Lantai ${fl.num}`}
                >{occupancy[fl.num]}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
