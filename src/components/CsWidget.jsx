import { useState, useRef, useCallback, useEffect } from 'react'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { IconHeadset, IconClose } from './Icons'

/* WFS PROJECT AI Copilot Widget */
export default function CsWidget() {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const onCloseRef = useRef(() => {})
  useEffect(() => { onCloseRef.current = () => setOpen(false) })
  const closeWidget = useCallback(() => onCloseRef.current(), [])
  useModalFlag(open)
  useDialogA11y({ open, onClose: closeWidget, ref: box })

  return (
    <>
      {open && (
        <div ref={box} id="cs-widget" className="panel wide" role="dialog" aria-label="WFS AI Copilot" aria-modal="true" style={{ background: '#0B0F17', color: '#fff', zIndex: 'var(--z-widget)', height: 'min(500px, calc(100dvh - 170px))', borderColor: 'rgba(16,229,160,.5)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#0d1522', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ flex: 1, paddingLeft: 14, fontSize: 12, fontWeight: 700, color: '#10E5A0', letterSpacing: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconHeadset size={14} />
              <span>WFS PROJECT COPILOT</span>
            </div>
            <button className="x" onClick={() => setOpen(false)} aria-label="Tutup widget Copilot" title="Tutup widget Copilot (Esc)">
              <IconClose size={18} />
              <span className="sr-only">✕</span>
            </button>
          </div>
          <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC' }}>
              Autonomous AI Software House Copilot
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.6 }}>
              WFS PROJECT siap menerima instruksi pengembangan aplikasi Anda. Gunakan tombol <strong>🚀 Proyek</strong> untuk membuka Task Composer, menyusun rencana, dan mengeksekusi pembangunan di isolated Docker sandbox.
            </p>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, fontSize: 11, fontFamily: 'monospace', color: '#10E5A0' }}>
              ● 11 AI Agents Active & Standby 24/7
            </div>
          </div>
        </div>
      )}
      <button className="ibtn" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="cs-widget" aria-label="Buka widget Copilot" title="WFS AI Copilot">
        <span className="ic"><IconHeadset size={19} /><span className="sr-only">🛎</span></span><span className="lb">Copilot</span>
      </button>
    </>
  )
}
