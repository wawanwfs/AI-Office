import React, { useState, useEffect, useRef } from 'react'

export default function ActionMenu({ sceneRef, onFlash, refApi }) {
  const [open, setOpen] = useState(false)
  const [namesOn, setNamesOn] = useState(true)
  const [rotOn, setRotOn] = useState(false)
  const wrap = useRef(null)

  // expose aksi nama/rotasi agar shortcut keyboard (K/R) bisa memicunya dari App
  useEffect(() => {
    if (!refApi) return
    window.__amApiSet = Date.now() // debug: bukti effect ActionMenu jalan
    refApi.current = {
      toggleNames: () => {
        const s = sceneRef && sceneRef.current
        if (!s || !s.toggleNames) return onFlash && onFlash('Scene 3D tidak aktif (WebGL tidak tersedia)', true)
        s.toggleNames(); if (s.isNamesVisible) setNamesOn(s.isNamesVisible()); else setNamesOn(v => !v)
      },
      toggleRotate: () => {
        const s = sceneRef && sceneRef.current
        if (!s || !s.setAutoRotate) return onFlash && onFlash('Scene 3D tidak aktif (WebGL tidak tersedia)', true)
        const cur = s.isAutoRotate ? s.isAutoRotate() : rotOn
        s.setAutoRotate(!cur); if (s.isAutoRotate) setRotOn(s.isAutoRotate()); else setRotOn(!cur)
      },
    }
    return () => { refApi.current = null }
  }, [refApi, sceneRef, onFlash])

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
          <button role="menuitem" onClick={() => { if (scene() && scene().toggleNames) { scene().toggleNames(); if (scene().isNamesVisible) setNamesOn(scene().isNamesVisible()); else setNamesOn(v => !v) } }}><span>🏷️</span>{namesOn ? 'Sembunyikan' : 'Tampilkan'} nama</button>
          <button role="menuitem" onClick={() => { if (scene() && scene().setAutoRotate) { scene().setAutoRotate(!rotOn); if (scene().isAutoRotate) setRotOn(scene().isAutoRotate()); else setRotOn(v => !v) } }}><span>🔄</span>Putar otomatis: {rotOn ? 'ON' : 'OFF'}</button>
        </div>
      )}
      <button className="ibtn" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu"><span className="ic">⚡</span><span className="lb">Aksi</span></button>
    </span>
  )
}
