import React, { useRef, useCallback, useEffect } from 'react'
import { useDialogA11y } from '../lib/dialogA11y'
import { IconClose } from './Icons'

export default function ConfirmModal({ show, title, text, confirmLabel = 'Ya, lanjut', danger, busy, onConfirm, onCancel }) {
  const box = useRef(null)
  const onCancelRef = useRef(onCancel)
  useEffect(() => { onCancelRef.current = onCancel })
  const cancelViaA11y = useCallback(() => onCancelRef.current(), [])
  useDialogA11y({ open: show, onClose: cancelViaA11y, ref: box })
  if (!show) return null
  return (
    <div className="modal-scrim" role="presentation" onClick={onCancel}>
      <div ref={box} className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" onClick={e => e.stopPropagation()}>
        <button type="button" className="x" onClick={onCancel} title="Batal (Esc)" aria-label="Tutup dialog konfirmasi">
          <IconClose size={16} />
          <span className="sr-only">✕</span>
        </button>
        <h3 id="cf-t" style={{ paddingRight: 32 }}>{title}</h3>
        <p>{text}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Batal</button>
          <button className="btn primary" style={danger ? { background: '#ef4444', color: '#fff' } : null} disabled={busy} onClick={onConfirm} autoFocus>{busy ? 'Memproses…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
