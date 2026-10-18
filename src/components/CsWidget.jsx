import { useState, useEffect } from 'react'
import { useModalFlag } from '../lib/modal'

/* Widget AI CS dibantuin — iframe ke widget container */
export default function CsWidget() {
  const [open, setOpen] = useState(false)
  useModalFlag(open)
  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open])
  return (
    <>
      {open && (
        <div className="panel wide" role="dialog" aria-label="AI CS dibantuin" style={{ background: '#fff', zIndex: 'var(--z-widget)', height: 'min(500px, calc(100dvh - 170px))', borderColor: 'rgba(16,229,160,.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#0d1522' }}>
            <div style={{ flex: 1, paddingLeft: 14, fontSize: 12, fontWeight: 700, color: '#10E5A0', letterSpacing: 1.5 }}>🛎 AI CS DIBANTUIN</div>
            <button className="x" onClick={() => setOpen(false)} aria-label="Tutup widget CS">✕</button>
          </div>
          <iframe src={import.meta.env.VITE_CS_WIDGET_URL || '/cs-widget/'} style={{ border: 0, width: '100%', flex: 1 }} title="AI CS dibantuin" />
        </div>
      )}
      <button className="ibtn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Buka widget AI CS"><span className="ic">🛎</span><span className="lb">AI CS</span></button>
    </>
  )
}
