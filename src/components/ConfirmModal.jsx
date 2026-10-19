import React, { useEffect, useRef } from 'react'
import { useDialogA11y } from '../lib/dialogA11y'

export default function ConfirmModal({ show, title, text, confirmLabel = 'Ya, lanjut', danger, busy, onConfirm, onCancel }) {
  const box = useRef(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  useDialogA11y({ open: show, onClose: () => onCancelRef.current(), ref: box })
  if (!show) return null
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div ref={box} className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" onClick={e => e.stopPropagation()}>
        <h3 id="cf-t">{title}</h3>
        <p>{text}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Batal</button>
          <button className="btn primary" style={danger ? { background: '#ef4444', color: '#fff' } : null} disabled={busy} onClick={onConfirm} autoFocus>{busy ? 'Memproses…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
