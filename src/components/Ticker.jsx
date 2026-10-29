import React, { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clip } from '../lib/clip.js'
import { tickerPresenceSummary } from '../scene/parts/agent_status.js'

const FALLBACK = [{ text: 'Gateway belum terhubung — menunggu data…', color: '#8b93a3' }]
const COL = { done: '#10E5A0', running: '#F59E0B', failed: '#FB7185', review: '#60A5FA', pending: '#9aa3b5' }
// Titik badge kehadiran — konsisten STATUS_HEX agent_status.js (siklus 140):
// work hijau, meet biru, lunch amber, walk biru muda, dim abu.
const STATUS_DOT = { work: '#10E5A0', meet: '#60A5FA', lunch: '#F59E0B', walk: '#4D9FFF', dim: '#8b93a3' }

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

  useEffect(() => {
    const read = () => setPresence(tickerPresenceSummary(window.__agentData))
    read()
    const iv = setInterval(read, 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    let stop = false
    let rid = 0 // guard out-of-order (pola TaskBoard siklus 131): poll #2 menyusul
    // saat #1 menggantung (tak di-abort) → batch LAMA tak menimpa batch BARU,
    // kegagalan batch basi tak menampilkan "Gateway offline" palsu.
    const load = async () => {
      const my = ++rid
      try {
        const [t, a, s] = await Promise.all([api('tasks'), api('agents'), api('status')])
        if (stop || my !== rid) return
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
        if (!stop && my === rid) setMsgs(out)
      } catch {
        if (!stop && my === rid) setMsgs([{ text: 'Gateway offline — mencoba lagi…', color: '#FB7185' }])
      }
    }
    load()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load() }, 20000)
    return () => { stop = true; clearInterval(iv) }
  }, [])

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
