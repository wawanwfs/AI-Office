import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clip } from '../lib/clip.js'

const FALLBACK = [{ text: 'Gateway belum terhubung — menunggu data…', color: '#8b93a3' }]
const COL = { done: '#10E5A0', running: '#F59E0B', failed: '#FB7185', review: '#60A5FA', pending: '#9aa3b5' }

// Ticker berisi data NYATA dari gateway (task, agent, resource host).
// Ticker live: lemaribaca screen reader diperbarui via region aria-live polite
// (TICKER_LIVE), sementara track animasi (marquee visual) aria-hidden penuh —
// teks bergerak tidak dibacakan, status terbaru tetap diumumkan tiap refresh.
// Prop opsional `conn` = badge koneksi dari connection_spec (shape sama dgn chip
// HUD: { state, label, detail, tone }) — dirender sebagai chip statis di tepi
// kiri pita, sejajar info gateway yang sudah ada di HUD.
export default function Ticker({ conn }) {
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
        out.push({ text: `${tasks.length} task · ${cnt.done || 0} done · ${cnt.running || 0} running · ${cnt.pending || 0} pending · ${cnt.failed || 0} failed`, color: '#4D9FFF' })
        tasks.slice(-8).reverse().forEach(x => out.push({
          text: `${x.agent_id ? (name[x.agent_id] || x.agent_id) : 'Tanpa agen'} — ${clip(x.title, 48)} [${x.status}]`,
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
  const liveText = [conn && conn.label, ...msgs.map(m => m.text)].filter(Boolean).join(' · ')
  return (
    <>
      <div id="ticker-live" role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{liveText}</div>
      <div className="ticker" role="presentation" aria-hidden="true">
        {conn && (
          <span
            className={`ticker-conn ticker-conn-${conn.tone || 'ok'}`}
            role="status"
            title={conn.detail}
            aria-label={conn.detail}
          >
            <i aria-hidden="true" />
            <span>{conn.label}</span>
          </span>
        )}
        <div className="ticker-window"><div className="track">
          {list.map((m, i) => {
            // Dua salinan track (efek marquee); key harus unik antar salinan
            // supaya tidak ada peringatan React "duplicate key" tiap render.
            const k = i < msgs.length ? 'f' + i : 's' + (i - msgs.length)
            return <span key={k} style={{ color: m.color }} aria-hidden="true">▸ {m.text}</span>
          })}
        </div></div>
      </div>
    </>
  )
}
