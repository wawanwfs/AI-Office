import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'

export default function ActionMenu({ sceneRef, onFlash, actionMenuRef }) {
  const [open, setOpen] = useState(false)
  const pop = useRef(null)
  useModalFlag(open)
  // onClose stabil (ref + useCallback): inline closure membuat effect useDialogA11y
  // re-run tiap render — toggle nama/rotasi di menu memicu setNamesOn/setRotOn,
  // cleanup-nya melempar fokus kembali ke tombol pemicu ⚡ di tengah interaksi menu.
  const onCloseRef = useRef(() => setOpen(false))
  const closeMenu = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open, onClose: closeMenu, ref: pop })
  const [namesOn, setNamesOn] = useState(true)
  const [rotOn, setRotOn] = useState(false)
  const wrap = useRef(null)

  // expose aksi nama/rotasi agar shortcut keyboard (K/R) bisa memicunya dari App
  const amRef = useRef(null)
  useEffect(() => {
    amRef.current = {
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
    if (actionMenuRef) {
      window.__amApiSet = Date.now() // debug: bukti effect ActionMenu jalan
      actionMenuRef.current = amRef.current
    }
    return () => { if (actionMenuRef) actionMenuRef.current = null }
  }, [actionMenuRef, sceneRef, onFlash, rotOn])

  useEffect(() => {
    if (!open) return
    // sinkronkan state tampilan dengan scene sungguhan (scene mungkin sudah diubah sejak mount)
    const s = sceneRef && sceneRef.current
    if (s) {
      if (s.isNamesVisible) setNamesOn(v => (v === s.isNamesVisible() ? v : s.isNamesVisible())) // eslint-disable-line react-hooks/set-state-in-effect -- sinkronisasi sekali saat menu dibuka
      if (s.isAutoRotate) setRotOn(v => (v === s.isAutoRotate() ? v : s.isAutoRotate()))
    }
    const k = e => { if (e.key === 'Escape') setOpen(false) }
    const c = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', k); document.addEventListener('pointerdown', c)
    return () => { document.removeEventListener('keydown', k); document.removeEventListener('pointerdown', c) }
  }, [open])

  // Navigasi panah menu (Up/Down/Home/End) — pola WAI-ARIA menu
  const menuKeys = e => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const els = pop.current ? [...pop.current.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"]')] : []
    if (!els.length) return
    e.preventDefault()
    const i = els.indexOf(document.activeElement)
    let n
    if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = els.length - 1
    else n = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length
    els[n].focus()
  }
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
        <div ref={pop} className="pop" role="menu" aria-label="Aksi tim" aria-modal="true" style={{ left: 0 }} onKeyDown={menuKeys}>
          {items.map(([ic, label, key, msg]) => <button key={key} role="menuitem" onClick={() => act(key, msg)}><span>{ic}</span>{label}</button>)}
          <hr />
          <button role="menuitemcheckbox" aria-checked={namesOn} onClick={() => { if (scene() && scene().toggleNames) { scene().toggleNames(); if (scene().isNamesVisible) setNamesOn(scene().isNamesVisible()); else setNamesOn(v => !v) } }}><span>🏷️</span>{namesOn ? 'Sembunyikan' : 'Tampilkan'} nama</button>
          <button role="menuitemcheckbox" aria-checked={rotOn} onClick={() => { if (scene() && scene().setAutoRotate) { scene().setAutoRotate(!rotOn); if (scene().isAutoRotate) setRotOn(scene().isAutoRotate()); else setRotOn(v => !v) } }}><span>🔄</span>Putar otomatis: {rotOn ? 'ON' : 'OFF'}</button>
        </div>
      )}
      <button className="ibtn" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu"><span className="ic">⚡</span><span className="lb">Aksi</span></button>
    </span>
  )
}
