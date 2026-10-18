import React, { useState, useEffect, useRef } from 'react'

export default function ActionMenu({ sceneRef, onFlash }) {
  const [open, setOpen] = useState(false)
  const [namesOn, setNamesOn] = useState(true)
  const [rotOn, setRotOn] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return
    // sinkronkan state tampilan dengan scene sungguhan (scene mungkin sudah diubah sejak mount)
    const s = sceneRef && sceneRef.current
    if (s) {
      if (s.isNamesVisible) setNamesOn(s.isNamesVisible())
      if (s.isAutoRotate) setRotOn(s.isAutoRotate())
    }
    const k = e => { if (e.key === 'Escape') setOpen(false) }
    const c = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', k); document.addEventListener('pointerdown', c)
    return () => { document.removeEventListener('keydown', k); document.removeEventListener('pointerdown', c) }
  }, [open])

  const scene = () => sceneRef.current
  const act = (a, msg) => {
    if (!scene() || !scene().teamAction) return onFlash('Scene 3D tidak aktif (WebGL tidak tersedia)', true)
    scene().teamAction(a); onFlash(msg); setOpen(false)
  }
  const items = [
    ['📢', 'Meeting sekarang', 'meeting', 'Semua dikumpulkan ke ruang meeting'],
    ['☕', 'Coffee break', 'break', 'Semua istirahat ke kafe'],
    ['💼', 'Kembali bekerja', 'work', 'Semua kembali ke meja'],
    ['🚶', 'Office tour', 'tour', 'Agent jalan-jalan keliling kantor'],
  ]
  return (
    <span className="anchor" ref={wrap}>
      {open && (
        <div className="pop" role="menu" aria-label="Aksi tim" style={{ left: 0 }}>
          {items.map(([ic, label, key, msg]) => <button key={key} role="menuitem" onClick={() => act(key, msg)}><span>{ic}</span>{label}</button>)}
          <hr />
          <button role="menuitem" onClick={() => { scene() && scene().toggleNames(); setNamesOn(v => !v) }}><span>🏷️</span>{namesOn ? 'Sembunyikan' : 'Tampilkan'} nama</button>
          <button role="menuitem" onClick={() => { scene() && scene().setAutoRotate(!rotOn); setRotOn(v => !v) }}><span>🔄</span>Putar otomatis: {rotOn ? 'ON' : 'OFF'}</button>
        </div>
      )}
      <button className="ibtn" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu"><span className="ic">⚡</span><span className="lb">Aksi</span></button>
    </span>
  )
}
