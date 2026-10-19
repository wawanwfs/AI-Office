import React, { useState, useEffect, useRef } from 'react'
import { useModalFlag } from '../lib/modal'

// Menu kecil untuk zoom + pencahayaan + preset sudut kamera (popover di atas dock)
export default function QuickToolbar({ onAddTask, onPauseAll, onResumeAll, onToggleTheme, theme, onZoomIn, onZoomOut, onSetView, paused }) {
  const [open, setOpen] = useState(false)
  useModalFlag(open)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const k = e => { if (e.key === 'Escape') setOpen(false) }
    const c = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', k); document.addEventListener('pointerdown', c)
    return () => { document.removeEventListener('keydown', k); document.removeEventListener('pointerdown', c) }
  }, [open])
  return (
    <>
      <button className="ibtn accent" onClick={onAddTask} title="Tambah task baru ke papan proyek" aria-label="Tambah task baru"><span className="ic">＋</span><span className="lb">Task</span></button>
      {paused
        ? <button className="ibtn good" onClick={onResumeAll} title="Lanjutkan semua task" aria-label="Lanjutkan semua task"><span className="ic">▶</span><span className="lb">Lanjut</span><span className="dot" /></button>
        : <button className="ibtn" onClick={onPauseAll} title="Jeda semua task" aria-label="Jeda semua task"><span className="ic">⏸</span><span className="lb">Jeda</span></button>}
      <span className="sep" />
      <button className="ibtn" onClick={onZoomOut} title="Zoom out — lihat lebih luas" aria-label="Perkecil"><span className="ic">🔍</span><span className="lb">Jauh</span></button>
      <button className="ibtn" onClick={onZoomIn} title="Zoom in — perbesar ruangan" aria-label="Perbesar"><span className="ic">🔎</span><span className="lb">Dekat</span></button>
      {['iso', 'front', 'top'].map(v => (
        <button key={v} className="ibtn" onClick={() => onSetView(v)} title={'Kamera ' + (v === 'iso' ? 'isometrik' : v === 'front' ? 'samping' : 'dari atas')} aria-label={'Kamera ' + v}>
          <span className="ic">{v === 'iso' ? '🧊' : v === 'front' ? '↔' : '🗺️'}</span>
          <span className="lb">{v === 'iso' ? 'Iso' : v === 'front' ? 'Depan' : 'Atas'}</span>
        </button>
      ))}
      <button className={'ibtn' + (!theme ? ' on' : '')} onClick={onToggleTheme} aria-pressed={!theme} title="Mode lampu neon" aria-label="Lampu neon"><span className="ic">💡</span><span className="lb">Neon</span></button>
    </>
  )
}
