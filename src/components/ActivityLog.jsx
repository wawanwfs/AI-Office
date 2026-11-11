import React, { useRef, useCallback, useEffect } from 'react'
import { useDialogA11y } from '../lib/dialogA11y'
import { IconClose } from './Icons'
import { taskStatusColor, TASK_STATUS_COLORS } from '../lib/task_status_colors.js'
import { PURE_TEXT } from '../lib/ui_palette.js';

// Warna status delegasi ke satu sumber (siklus 373) — dulu failed/pending drift.
const COL = {
  done: taskStatusColor('done'),
  running: taskStatusColor('running'),
  failed: taskStatusColor('failed'),
  review: taskStatusColor('review'),
  pending: taskStatusColor('pending'),
}

// Log aktivitas: perubahan status task yang terdeteksi UI (disimpan di localStorage).
export default function ActivityLog({ show, items, onClose, onClear }) {
  const box = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const closeLog = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open: show, onClose: closeLog, ref: box })
  if (!show) return null
  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div ref={box} className="modal" role="dialog" aria-label="Log aktivitas" aria-modal="true" onClick={e => e.stopPropagation()}>
        <button className="x" onClick={onClose} title="Tutup log aktivitas (Esc)" aria-label="Tutup log aktivitas">
          <IconClose size={16} />
          <span className="sr-only">✕</span>
        </button>
        <h3>Log Aktivitas</h3>
        {items.length === 0
          ? <p>Belum ada perubahan status task sejak log dipantau.</p>
          : <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '55dvh', overflowY: 'auto' }}>
              {items.map((x, i) => (
                <li key={i} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.08)', fontSize: 13 }}>
                  <span style={{ color: TASK_STATUS_COLORS.pending, marginRight: 8 }}>{x.t}</span>
                  <span style={{ color: COL[x.status] || PURE_TEXT, fontWeight: 600 }}>{x.label}</span>
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
