import React, { useState, useEffect, useRef } from 'react'

// Menu kecil untuk zoom + pencahayaan (popover di atas dock)
export default function QuickToolbar({ onAddTask, onPauseAll, onResumeAll, onToggleTheme, theme, onZoomIn, onZoomOut, paused }) {
  const [open, setOpen] = useState(false)
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
      <button className="ibtn accent" onClick={onAddTask} aria-label="Tambah task baru"><span className="ic">＋</span><span className="lb">Task</span></button>
      {paused
        ? <button className="ibtn good" onClick={onResumeAll} aria-label="Lanjutkan semua task"><span className="ic">▶</span><span className="lb">Lanjut</span><span className="dot" /></button>
        : <button className="ibtn" onClick={onPauseAll} aria-label="Jeda semua task"><span className="ic">⏸</span><span className="lb">Jeda</span></button>}
      <span className="sep" />
      <button className="ibtn" onClick={onZoomOut} aria-label="Perkecil"><span className="ic">➖</span><span className="lb">Jauh</span></button>
      <button className="ibtn" onClick={onZoomIn} aria-label="Perbesar"><span className="ic">➕</span><span className="lb">Dekat</span></button>
      <button className={'ibtn' + (!theme ? ' on' : '')} onClick={onToggleTheme} aria-pressed={!theme} aria-label="Lampu neon"><span className="ic">💡</span><span className="lb">Neon</span></button>
    </>
  )
}
