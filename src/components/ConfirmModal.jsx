import React, { useEffect } from 'react'

export default function ConfirmModal({ show, title, text, confirmLabel = 'Ya, lanjut', danger, busy, onConfirm, onCancel }) {
  useEffect(() => {
    if (!show) return
    const h = e => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [show])
  if (!show) return null
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" onClick={e => e.stopPropagation()}>
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
