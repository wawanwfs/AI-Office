import React, { useEffect, useRef, useCallback } from 'react'
import { useDialogA11y } from '../lib/dialogA11y'

const COL = { done: '#10E5A0', running: '#F59E0B', failed: '#FB7185', review: '#60A5FA', pending: '#9aa3b5' }

// Log aktivitas: perubahan status task yang terdeteksi UI (disimpan di localStorage).
export default function ActivityLog({ show, items, onClose, onClear }) {
  const box = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const closeA11yRef = useRef(() => {})
  closeA11yRef.current = () => onCloseRef.current()
  const closeLog = useCallback(() => closeA11yRef.current(), [])
  useDialogA11y({ open: show, onClose: closeLog, ref: box })
  if (!show) return null
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div ref={box} className="modal" role="dialog" aria-label="Log aktivitas" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h3>Log Aktivitas</h3>
        {items.length === 0
          ? <p>Belum ada perubahan status task sejak log dipantau.</p>
          : <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '55dvh', overflowY: 'auto' }}>
              {items.map((x, i) => (
                <li key={i} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.08)', fontSize: 13 }}>
                  <span style={{ color: '#8b93a3', marginRight: 8 }}>{x.t}</span>
                  <span style={{ color: COL[x.status] || '#fff', fontWeight: 600 }}>{x.label}</span>
                  {' '}#{x.id} {x.title}
                </li>
              ))}
            </ul>}
        <div className="modal-actions">
          {items.length > 0 && <button className="btn" onClick={onClear}>Bersihkan</button>}
          <button className="btn" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  )
}
