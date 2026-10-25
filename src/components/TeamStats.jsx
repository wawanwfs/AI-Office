import { clip } from '../lib/clip.js'
import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { fileCount } from '../lib/files'
import { IconStats, IconClose } from './Icons'

// Animasi angka: lerp dengan easing untuk feedback visual yang hidup (tanpa lib tambahan).
function useTween(target, ms = 550) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf
    if (target === v) { setV(target); return }
    const start = performance.now(), from = v
    const step = t => {
      const p = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      setV(Math.round(from + (target - from) * e))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return v
}

/* Statistik Tim — data nyata dari task engine + resource host */
export default function TeamStats() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(false)
  const box = useRef(null)
  useModalFlag(open)
  // onClose stabil (ref + useCallback): panel polling tiap 15 dtk — inline closure
  // membuat effect useDialogA11y re-run tiap render dan cleanup-nya melempar fokus
  // ke tombol ✕ berulang (pola bug sama dgn WfsPanel/ProjectPanel).
  const onCloseRef = useRef(() => setOpen(false))
  const closeStats = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open, onClose: closeStats, ref: box })

  const load = useCallback(async (signal) => {
    try {
      const d = await api('tasks', { signal })
      setData(d.tasks || []); setErr(false)
    } catch (e) { if (e.name !== 'AbortError') setErr(true) }
    try { setRes(await api('system/resources', { signal })) } catch { /* abaikan */ }
  }, [])

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    const t0 = setTimeout(() => load(ac.signal), 0)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(ac.signal) }, 15000)
    const k = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', k)
    return () => { ac.abort(); clearTimeout(t0); clearInterval(iv); document.removeEventListener('keydown', k) }
  }, [open, load])

  const byStatus = {}
  let totalFiles = 0
  ;(data || []).forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; totalFiles += fileCount(t.files) })
  const dot = s => s === 'done' ? '#10E5A0' : s === 'failed' ? '#f66' : s === 'running' ? '#f59e0b' : s === 'review' ? '#60A5FA' : '#9aa3b5'
  // Hook tween DIPANGGIL tanpa syarat (5 baris tetap) agar urutan hook stabil antar render.
  const nDone = useTween(byStatus.done || 0)
  const nRunning = useTween(byStatus.running || 0)
  const nReview = useTween(byStatus.review || 0)
  const nFailed = useTween(byStatus.failed || 0)
  const nPending = useTween(byStatus.pending || 0)
  const TW = { done: nDone, running: nRunning, review: nReview, failed: nFailed, pending: nPending }

  return (
    <>
      {open && (
        <div ref={box} id="team-stats" className="panel left" role="dialog" aria-label="Statistik tim" aria-modal="true">
          <div className="ph">
            <div className="t">Statistik Tim<small>task engine · refresh 15 dtk</small></div>
            <button className="x" onClick={() => setOpen(false)} aria-label="Tutup statistik" title="Tutup statistik (Esc)">
              <IconClose size={18} />
              <span className="sr-only">✕</span>
            </button>
          </div>
          <div style={{ padding: '4px 14px 14px', overflowY: 'auto' }} aria-live="polite">
            {!data && !err && <div className="skeleton" role="status">Memuat statistik…</div>}
            {err && <div role="alert" className="msg err" style={{ maxWidth: '100%', marginBottom: 8 }}>Gateway offline. <button className="btn" style={{ minHeight: 32, marginLeft: 6 }} onClick={() => load()}>Coba lagi</button></div>}
            {data && data.length === 0 && <div className="skeleton">Belum ada task. Klik ＋ Task untuk membuat.</div>}
            {data && data.length > 0 && (
              <>
                <div className="stat-grid">
                  {[['done','Selesai'],['running','Jalan'],['review','Review'],['failed','Gagal'],['pending','Antri']].map(([s,l]) => (
                    <div key={s} role="img" aria-label={`${byStatus[s] || 0} task ${l.toLowerCase()}`}>
                      <b style={{color:dot(s)}} aria-hidden="true">{TW[s]}</b>
                      <span aria-hidden="true">{l}</span>
                    </div>
                  ))}
                </div>
                <div className="note" style={{ marginBottom: 6 }}>Total file dihasilkan: <b style={{ color: '#fff' }}>{totalFiles}</b></div>
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {data.slice(-8).reverse().map(t => (
                    <div key={t.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6, background: dot(t.status) }} />
                      #{t.id} {clip(t.title, 34)}
                    </div>
                  ))}
                </div>
              </>
            )}
            {res && (
              <div style={{ marginTop: 10, background: 'rgba(255,255,255,.05)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
                <div style={{ color: '#10E5A0', fontWeight: 700, marginBottom: 4 }}>🖥 HOST: load {res.load} · RAM {res.ram_mb} MB</div>
                {(res.containers || []).slice(0, 9).map(c => (
                  <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', color: 'var(--text-tertiary)' }}>
                    <span>{c.name.replace('saas-dibantuin-', '').replace('wfs-agent-', 'sbx-')}</span>
                    <span style={{ color: '#fff' }}>{c.cpu} · {c.mem}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="note" style={{ marginTop: 10 }}>refresh 15 detik</div>
          </div>
        </div>
      )}
      <button className="ibtn" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="team-stats" aria-label="Statistik tim" title="Statistik & performa tim">
        <span className="ic"><IconStats size={19} /><span className="sr-only">📊</span></span><span className="lb">Statistik</span>
      </button>
    </>
  )
}
