import React, { useState, useEffect, useRef } from 'react'
import { useModalFlag } from '../lib/modal'
import {
  IconPlus, IconPlay, IconPause, IconZoomOut, IconZoomIn, IconHome, IconCamera,
  IconIso, IconFront, IconTop, IconNeon, IconMoon, IconSun, IconUserNext
} from './Icons'

// Menu kecil untuk zoom + pencahayaan + preset sudut kamera (popover di atas dock)
export default function QuickToolbar({ onAddTask, onPauseAll, onResumeAll, onToggleTheme, theme, onZoomIn, onZoomOut, onSetView, onGoHome, onSnapshot, onCycleAgent, paused }) {
  const [open, setOpen] = useState(false)
  useModalFlag(open)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const k = e => { if (e.key === 'Escape') setOpen(false) }
    const c = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('keydown', k); document.addEventListener('pointerdown', c)
    return () => { document.removeEventListener('keydown', k); document.removeEventListener('pointerdown', c) }
  }, [open])
  return (
    <>
      <button className="ibtn accent" onClick={onAddTask} title="Tambah task baru ke papan proyek" aria-label="Tambah task baru">
        <span className="ic"><IconPlus size={19} /><span className="sr-only">＋</span></span>
        <span className="lb">Task</span>
      </button>
      {paused
        ? <button className="ibtn good" onClick={onResumeAll} title="Lanjutkan semua task" aria-label="Lanjutkan semua task">
            <span className="ic"><IconPlay size={18} /><span className="sr-only">▶</span></span>
            <span className="lb">Lanjut</span>
            <span className="dot" />
          </button>
        : <button className="ibtn" onClick={onPauseAll} title="Jeda semua task" aria-label="Jeda semua task">
            <span className="ic"><IconPause size={18} /><span className="sr-only">⏸</span></span>
            <span className="lb">Jeda</span>
          </button>}
      <span className="sep" />
      <button className="ibtn" onClick={onZoomOut} title="Zoom out — lihat lebih luas (shortcut -)" aria-label="Perkecil">
        <span className="ic"><IconZoomOut size={19} /><span className="sr-only">🔍</span></span>
        <span className="lb">Jauh</span>
      </button>
      <button className="ibtn" onClick={onZoomIn} title="Zoom in — perbesar ruangan (shortcut +)" aria-label="Perbesar">
        <span className="ic"><IconZoomIn size={19} /><span className="sr-only">🔎</span></span>
        <span className="lb">Dekat</span>
      </button>
      {/* Siklus 176: padanan mobile tombol Escape — kamera balik ke overview &
          seleksi dihapus (kontrak resetFocus scene; dulu hanya ada di keyboard). */}
      {onGoHome && (
        <button className="ibtn" onClick={onGoHome} title="Kembali ke tampilan awal (shortcut Esc)" aria-label="Kembali ke tampilan awal">
          <span className="ic"><IconHome size={19} /><span className="sr-only">🏠</span></span>
          <span className="lb">Rumah</span>
        </button>
      )}
      {/* Siklus 178: FOTO — unduh PNG kanvas 3D (snapshot satu klik; dulu satu-satunya
          cara = screenshot browser. Prop opsional — tanpa prop tak dirender, kompat). */}
      {onSnapshot && (
        <button className="ibtn" onClick={onSnapshot} title="Simpan foto kantor sebagai PNG (screenshot 3D bersih tanpa tombol)" aria-label="Simpan foto kantor">
          <span className="ic"><IconCamera size={19} /><span className="sr-only">📷</span></span>
          <span className="lb">Foto</span>
        </button>
      )}
      {/* Siklus 182: AGEN — paritas tombol dgn shortcut C (siklus fokus agen).
          Paritas pola G↔FOTO (179): prop opsional — tanpa prop tak dirender. */}
      {onCycleAgent && (
        <button className="ibtn" onClick={() => onCycleAgent(false)} title="Fokus ke agen berikutnya (shortcut C)" aria-label="Agen berikutnya">
          <span className="ic"><IconUserNext size={19} /><span className="sr-only">👤</span></span>
          <span className="lb">Agen</span>
        </button>
      )}
      {['iso', 'front', 'top'].map(v => (
        <button key={v} className="ibtn" onClick={() => onSetView(v)} title={'Kamera ' + (v === 'iso' ? 'isometrik (shortcut 1)' : v === 'front' ? 'samping (shortcut 2)' : 'dari atas (shortcut 3)')} aria-label={'Kamera ' + v}>
          <span className="ic">
            {v === 'iso' ? <><IconIso size={19} /><span className="sr-only">🧊</span></> : v === 'front' ? <><IconFront size={19} /><span className="sr-only">↔</span></> : <><IconTop size={19} /><span className="sr-only">🗺️</span></>}
          </span>
          <span className="lb">{v === 'iso' ? 'Iso' : v === 'front' ? 'Depan' : 'Atas'}</span>
        </button>
      ))}
      <button
        className={'ibtn' + (!theme ? ' on' : '')}
        onClick={onToggleTheme}
        aria-pressed={!theme}
        title={!theme ? 'Mode Gelap aktif — Klik untuk ganti ke Mode Terang (shortcut N)' : 'Mode Terang aktif — Klik untuk ganti ke Mode Gelap (shortcut N)'}
        aria-label="Lampu neon"
      >
        <span className="ic">
          {!theme ? <IconSun size={19} style={{ color: '#F59E0B' }} /> : <IconMoon size={19} style={{ color: '#00F0FF' }} />}
          <span className="sr-only">💡</span>
        </span>
        <span className="lb">{!theme ? 'Terang' : 'Gelap'}</span>
      </button>
    </>
  )
}
