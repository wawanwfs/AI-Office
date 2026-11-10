import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { clip } from '../lib/clip.js'
import { tickerPresenceSummary, STATUS_HEX } from '../scene/parts/agent_status.js'
import { useVisibilityPoll } from '../lib/dialogA11y'

import { taskStatusColor, TASK_STATUS_COLORS } from '../lib/task_status_colors.js'
import { VIOLET_STATS } from '../lib/ui_palette.js'

const FALLBACK = [{ text: 'Gateway belum terhubung — menunggu data…', color: TASK_STATUS_COLORS.pending }]
const COL = {
  done: taskStatusColor('done'),
  running: taskStatusColor('running'),
  failed: taskStatusColor('failed'),
  review: taskStatusColor('review'),
  pending: taskStatusColor('pending'),
}
// Titik badge kehadiran — delegasi STATUS_HEX agent_status.js (satu sumber
// dgn chip HUD & scene, siklus 383):
const STATUS_DOT = STATUS_HEX

// Ticker berisi data NYATA dari gateway (task, agent, resource host).
// Ticker live: lemaribaca screen reader diperbarui via region aria-live polite
// (TICKER_LIVE), sementara track animasi (marquee visual) aria-hidden penuh —
// teks bergerak tidak dibacakan, status terbaru tetap diumumkan tiap refresh.
// Prop opsional `conn` = badge koneksi dari connection_spec (shape sama dgn chip
// HUD: { state, label, detail, tone }) — dirender sebagai chip statis di tepi
// kiri pita, sejajar info gateway yang sudah ada di HUD.
export default function Ticker({ conn }) {
  const [msgs, setMsgs] = useState(FALLBACK)
  // Siklus 149: kehadiran agen LIVE dari scene (window.__agentData) — polling
  // 1 dtk tanpa timer baru terpisah (pola FloorNavigator siklus 143). null =
  // scene belum siap / 0 agen → baris disembunyikan (bukan teks kosong palsu).
  const [presence, setPresence] = useState(null)

  // Siklus 337: poll presence satu sumber via useVisibilityPoll.
  useVisibilityPoll(() => setPresence(tickerPresenceSummary(window.__agentData)), 1000)

  // Siklus 337: poll API ticker satu sumber via useVisibilityPoll. Guard
  // out-of-order (pola TaskBoard siklus 131) via ref di level komponen:
  // poll #2 menyusul saat #1 menggantung → batch LAMA tak menimpa batch
  // BARU, kegagalan batch basi tak menampilkan "Gateway offline" palsu.
  const apiRid = useRef(0)
  const apiStop = useRef(false)
  useEffect(() => { apiStop.current = false; return () => { apiStop.current = true } }, [])
  const load = useCallback(async () => {
    const my = ++apiRid.current
    try {
      const [t, a, s] = await Promise.all([api('tasks'), api('agents'), api('status')])
      if (apiStop.current || my !== apiRid.current) return
      const agents = Array.isArray(a) ? a : (a.agents || [])
        const name = Object.fromEntries(agents.map(x => [x.id, x.name]))
        const tasks = t.tasks || []
        const out = []
        const cnt = {}
        tasks.forEach(x => { cnt[x.status] = (cnt[x.status] || 0) + 1 })
        out.push({ text: `${tasks.length} task · ${cnt.done || 0} done · ${cnt.running || 0} running · ${cnt.pending || 0} pending · ${cnt.failed || 0} failed`, color: taskStatusColor('review') || '#fff' })
        tasks.slice(-8).reverse().forEach(x => out.push({
          text: `${x.agent_id ? (name[x.agent_id] || x.agent_id) : 'Tanpa agen'} — ${clip(x.title, 48)} [${x.status}]`,
          color: COL[x.status] || '#fff',
        }))
        if (s && s.mem_total_mb) out.push({ text: `Host RAM tersedia ${s.mem_available_mb}/${s.mem_total_mb} MB · disk ${s.disk_used_gb}/${s.disk_total_gb} GB`, color: VIOLET_STATS })
      if (!apiStop.current && my === apiRid.current) setMsgs(out)
    } catch {
      if (!apiStop.current && my === apiRid.current) setMsgs([{ text: 'Gateway offline — mencoba lagi…', color: TASK_STATUS_COLORS.failed }])
    }
  }, [])
  useVisibilityPoll(load, 20000)

  const list = [...msgs, ...msgs]
  const liveText = [conn && conn.label, ...msgs.map(m => m.text)].filter(Boolean).join(' · ')
  const livePresence = presence ? presence.map(s => `${s.count} ${s.label}`).join(' · ') : null
  return (
    <>
      <div id="ticker-live" role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{[livePresence, liveText].filter(Boolean).join(' · ')}</div>
      <div className="ticker" role="presentation" aria-hidden="true">
        {presence && presence.length > 0 && (
          <span className="ticker-presence" role="presentation">
            {presence.map((s) => (
              <span key={s.key} className="ticker-presence-item">
                {!s.first && <span className="ticker-presence-sep" aria-hidden="true">·</span>}
                <i style={{ background: STATUS_DOT[s.key] }} aria-hidden="true" />
                {s.count} {s.label}
              </span>
            ))}
          </span>
        )}
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
