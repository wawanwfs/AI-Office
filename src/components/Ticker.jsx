import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'

const FALLBACK = [{ text: 'Gateway belum terhubung — menunggu data…', color: '#8b93a3' }]
const COL = { done: '#10E5A0', running: '#F59E0B', failed: '#FB7185', review: '#60A5FA', pending: '#9aa3b5' }

// Ticker berisi data NYATA dari gateway (task, agent, resource host).
export default function Ticker() {
  const [msgs, setMsgs] = useState(FALLBACK)

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const [t, a, s] = await Promise.all([api('tasks'), api('agents'), api('status')])
        const agents = Array.isArray(a) ? a : (a.agents || [])
        const name = Object.fromEntries(agents.map(x => [x.id, x.name]))
        const tasks = t.tasks || []
        const out = []
        const cnt = {}
        tasks.forEach(x => { cnt[x.status] = (cnt[x.status] || 0) + 1 })
        out.push({ text: `${tasks.length} task · ${cnt.done || 0} done · ${cnt.running || 0} running · ${cnt.pending || 0} pending · ${cnt.failed || 0} failed`, color: '#0DEEF3' })
        tasks.slice(-8).reverse().forEach(x => out.push({
          text: `${name[x.agent_id] || x.agent_id} — ${String(x.title).slice(0, 48)} [${x.status}]`,
          color: COL[x.status] || '#fff',
        }))
        if (s && s.mem_total_mb) out.push({ text: `Host RAM tersedia ${s.mem_available_mb}/${s.mem_total_mb} MB · disk ${s.disk_used_gb}/${s.disk_total_gb} GB`, color: '#A78BFA' })
        if (!stop) setMsgs(out)
      } catch {
        if (!stop) setMsgs([{ text: 'Gateway offline — mencoba lagi…', color: '#FB7185' }])
      }
    }
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 20000)
    return () => { stop = true; clearInterval(iv) }
  }, [])

  const list = [...msgs, ...msgs]
  return (
    <div className="ticker" role="marquee" aria-label="Aktivitas tim langsung dari gateway">
      <div className="track">
        {list.map((m, i) => <span key={i} style={{ color: m.color }} aria-hidden={i >= msgs.length}>▸ {m.text}</span>)}
      </div>
    </div>
  )
}
