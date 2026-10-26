import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'

// Meter status host — data NYATA dari gateway (status + resources), polled tiap 12 dtk.
// Widget kecil kanan-atas supaya "data yang ada" selalu terlihat tanpa buka panel.
const fmtUptime = s => {
  if (!s && s !== 0) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h}j ${m}m` : `${m}m`
}

export default function SysMeter() {
  const [d, setD] = useState(null)
  const [sceneAgents, setSceneAgents] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const [st, res] = await Promise.all([api('status'), api('system/resources')])
        if (stop) return
        setD({ ...st, load: res?.load ?? '—', ram: res?.ram_mb ?? '—' })
        setErr(false)
      } catch {
        if (!stop) setErr(true)
      }
    }
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 12000)
    // hitungan agen dari scene 3D (window.__agentData diisi OfficeScene) — sumber kebenaran visual
    const readScene = () => setSceneAgents((window.__agentData || []).length || null)
    readScene()
    const iv2 = setInterval(readScene, 4000)
    return () => { stop = true; clearInterval(iv); clearInterval(iv2) }
  }, [])

  if (!d) {
    return (
      <div className="sysmeter" role="status" aria-label="Status host">
        <span className="sm-item">{err ? 'Gateway offline' : 'Memuat host…'}</span>
      </div>
    )
  }
  return (
    <div className="sysmeter" role="status" aria-label="Status host">
      <span className="sm-item sm-hl" title="Agen aktif di kantor 3D"><i />{sceneAgents ?? d.agents} agent</span>
      <span className="sm-item" title="Load average host">⚡ {d.load}</span>
      <span className="sm-item" title="RAM terpakai / total">🧠 {d.ram}</span>
      <span className="sm-item" title="Disk terpakai / total">💾 {d.disk_used_gb}/{d.disk_total_gb} GB</span>
      <span className="sm-item" title="Uptime host">⏱ {fmtUptime(d.uptime_s)}</span>
    </div>
  )
}
