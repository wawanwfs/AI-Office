import React, { useState, useEffect, useRef } from 'react'

const STEPS = [
  { title: 'Navigasi 3D', text: 'Tarik untuk memutar, scroll / cubit untuk zoom, atau pakai tombol 🔍＋ / 🔍－. Geser slider untuk mengubah waktu.' },
  { title: 'Chat & Konfigurasi Agent', text: 'Klik 💬 Chat AI Team atau klik karakter / nama agent untuk ngobrol dan mengatur model API tiap agent.' },
  { title: 'Aksi Tim', text: 'Tombol ⚡ Aksi Tim: kumpulkan meeting, coffee break, kembali kerja, atau office tour.' },
  { title: 'Task', text: '＋ Task membuat task baru, ⏸ Jeda menghentikan semua task yang berjalan, ▶ Lanjut menjalankan ulang task yang menunggu.' },
  { title: 'Warna Badge', text: 'Warna dada karakter = status task: hijau selesai, kuning berjalan, merah gagal, biru review.' },
]

export default function OverlayHelp({ show, onClose }) {
  const [step, setStep] = useState(0)
  const ref = useRef(null)
  const close = () => { setStep(0); onClose() }

  useEffect(() => {
    if (!show) return
    ref.current && ref.current.focus()
    const h = e => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [show])  // close stabil per-open; dependensi lengkap tak perlu

  if (!show) return null
  return (
    <div className="modal-scrim" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-t" tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <h3 id="help-t">{STEPS[step].title} <span style={{ opacity: .6, fontSize: 12 }}>({step + 1}/{STEPS.length})</span></h3>
        <p>{STEPS[step].text}</p>
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn" disabled={step === 0} onClick={() => setStep(s => s - 1)}>← Sebelumnya</button>
          {step < STEPS.length - 1
            ? <button className="btn primary" onClick={() => setStep(s => s + 1)}>Berikutnya →</button>
            : <button className="btn primary" onClick={close}>Selesai</button>}
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}><button className="btn" style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)' }} onClick={close}>Tutup (Esc)</button></div>
      </div>
    </div>
  )
}
