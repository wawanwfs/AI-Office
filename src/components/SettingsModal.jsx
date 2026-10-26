import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import {
  IconClose, IconGear, IconVolume, IconVolumeMute,
  IconTag, IconRotate, IconSun, IconMoon, IconPlay
} from './Icons'
import {
  VOLUME_PRESETS, clampVolume, formatVolumePercent,
  loadAudioVolume, saveAudioVolume,
  loadAmbienceEnabled, saveAmbienceEnabled,
  loadAmbienceVolume, saveAmbienceVolume,
  clampAmbienceVolume, formatAmbiencePercent,
} from '../scene/parts/sound_spec'

export default function SettingsModal({
  show,
  onClose,
  sceneRef,
  muted = false,
  onToggleMute,
  cyberpunk = false,
  onToggleTheme,
  onFlash,
}) {
  useModalFlag(show)

  const [volume, setVolume] = useState(() => {
    return loadAudioVolume(typeof localStorage !== 'undefined' ? localStorage : null)
  })

  const [ambienceOn, setAmbienceOn] = useState(() => {
    return loadAmbienceEnabled(typeof localStorage !== 'undefined' ? localStorage : null)
  })

  const [ambienceVol, setAmbienceVol] = useState(() => {
    return loadAmbienceVolume(typeof localStorage !== 'undefined' ? localStorage : null)
  })

  const [namesOn, setNamesOn] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem('wfs_names') !== '0' : true
    } catch {
      return true
    }
  })

  const [rotOn, setRotOn] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem('wfs_autorot') === '1' : false
    } catch {
      return false
    }
  })

  const [testTip, setTestTip] = useState('')
  const box = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const closeViaA11y = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open: show, onClose: closeViaA11y, ref: box })

  // Sinkronkan state dengan scene ketika modal dibuka
  useEffect(() => {
    if (!show) return
    const s = sceneRef && sceneRef.current
    if (s) {
      if (s.getAudioVolume) {
        const curVol = s.getAudioVolume()
        if (Number.isFinite(curVol)) {
          setVolume(v => (Math.abs(v - curVol) < 0.001 ? v : curVol)) // eslint-disable-line react-hooks/set-state-in-effect -- sinkronisasi volume saat modal dibuka
        }
      }
      if (s.isAmbienceEnabled) {
        const curAmb = s.isAmbienceEnabled()
        setAmbienceOn(v => (v === curAmb ? v : curAmb))
      }
      if (s.getAmbienceVolume) {
        const curAmbVol = s.getAmbienceVolume()
        if (Number.isFinite(curAmbVol)) {
          setAmbienceVol(v => (Math.abs(v - curAmbVol) < 0.001 ? v : curAmbVol))
        }
      }
      if (s.isNamesVisible) {
        setNamesOn(v => (v === s.isNamesVisible() ? v : s.isNamesVisible()))
      }
      if (s.isAutoRotate) {
        setRotOn(v => (v === s.isAutoRotate() ? v : s.isAutoRotate()))
      }
    }
    setTestTip('')
  }, [show, sceneRef])

  if (!show) return null

  const handleSliderChange = (e) => {
    const raw = parseFloat(e.target.value)
    const next = clampVolume(raw)
    setVolume(next)
    const s = sceneRef && sceneRef.current
    if (s && s.setAudioVolume) {
      s.setAudioVolume(next)
    } else {
      saveAudioVolume(typeof localStorage !== 'undefined' ? localStorage : null, next)
    }
  }

  const handlePreset = (presetVal) => {
    const next = clampVolume(presetVal)
    setVolume(next)
    const s = sceneRef && sceneRef.current
    if (s && s.setAudioVolume) {
      s.setAudioVolume(next)
      if (!muted && s.playSelect) s.playSelect()
    } else {
      saveAudioVolume(typeof localStorage !== 'undefined' ? localStorage : null, next)
    }
  }

  const handleToggleAmbience = () => {
    const next = !ambienceOn
    setAmbienceOn(next)
    const s = sceneRef && sceneRef.current
    if (s && s.setAmbienceEnabled) {
      s.setAmbienceEnabled(next)
      if (next && !muted && s.playSelect) s.playSelect()
    } else {
      saveAmbienceEnabled(typeof localStorage !== 'undefined' ? localStorage : null, next)
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('wfs-ambience-changed', { detail: { enabled: next, volume: ambienceVol } }))
        }
      } catch { /* noop */ }
    }
    if (onFlash) onFlash(next ? 'Ambience ruangan aktif (HVAC & Room Hum)' : 'Ambience ruangan dinonaktifkan')
  }

  const handleAmbienceVolChange = (e) => {
    const raw = parseFloat(e.target.value)
    const next = clampAmbienceVolume(raw)
    setAmbienceVol(next)
    const s = sceneRef && sceneRef.current
    if (s && s.setAmbienceVolume) {
      s.setAmbienceVolume(next)
    } else {
      saveAmbienceVolume(typeof localStorage !== 'undefined' ? localStorage : null, next)
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('wfs-ambience-changed', { detail: { enabled: ambienceOn, volume: next } }))
        }
      } catch { /* noop */ }
    }
  }

  const handleTestAudio = (sampleType = 'done') => {
    if (muted) {
      setTestTip('Audio saat ini dibisukan. Nyalakan suara untuk mendengar uji nada.')
      return
    }
    const s = sceneRef && sceneRef.current
    if (!s) {
      setTestTip('Scene 3D belum aktif.')
      return
    }
    if (s.testAudio) {
      s.testAudio(sampleType)
      const label = sampleType === 'done'
        ? 'Task Selesai'
        : sampleType === 'select'
          ? 'Blip Seleksi'
          : sampleType === 'urgent'
            ? 'Prioritas Urgent'
            : sampleType === 'ambience'
              ? 'Hum Ruang (HVAC)'
              : sampleType === 'card'
                ? 'Kartu Kanban'
                : 'Peringatan'
      setTestTip(`Memainkan sampel suara: ${label}`)
    } else if (sampleType === 'done' && s.playTaskDone) {
      s.playTaskDone()
      setTestTip('Memainkan nada Task Selesai')
    } else if (sampleType === 'urgent' && s.playTaskUrgent) {
      s.playTaskUrgent()
      setTestTip('Memainkan nada Prioritas Urgent')
    } else if (sampleType === 'card' && s.playCardDrop) {
      s.playCardDrop()
      setTestTip('Memainkan nada Kartu Kanban')
    }
  }

  const handleToggleNames = () => {
    const s = sceneRef && sceneRef.current
    if (s && s.toggleNames) {
      s.toggleNames()
      const next = s.isNamesVisible ? s.isNamesVisible() : !namesOn
      setNamesOn(next)
      if (onFlash) onFlash(next ? 'Label nama agen ditampilkan' : 'Label nama agen disembunyikan')
    } else {
      setNamesOn(v => !v)
    }
  }

  const handleToggleRotate = () => {
    const s = sceneRef && sceneRef.current
    if (s && s.setAutoRotate) {
      const next = !rotOn
      s.setAutoRotate(next)
      setRotOn(s.isAutoRotate ? s.isAutoRotate() : next)
      if (onFlash) onFlash(next ? 'Rotasi kamera otomatis aktif' : 'Rotasi kamera dinonaktifkan')
    } else {
      setRotOn(v => !v)
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        ref={box}
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sm-title"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 460 }}
      >
        <button
          type="button"
          className="x"
          onClick={onClose}
          title="Tutup pengaturan (Esc)"
          aria-label="Tutup pengaturan"
        >
          <IconClose size={16} />
          <span className="sr-only">✕</span>
        </button>

        <h3 id="sm-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px 0' }}>
          <IconGear size={20} style={{ color: 'var(--teal)' }} />
          Pengaturan Kantor 3D
        </h3>
        <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
          Kustomisasi audio notifikasi Web Audio, tingkat volume, dan kontrol visual kantor.
        </p>

        {/* ── BAGIAN AUDIO ── */}
        <div className="settings-section" style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {muted ? <IconVolumeMute size={18} style={{ color: '#fb7185' }} /> : <IconVolume size={18} style={{ color: 'var(--teal)' }} />}
              <span style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}>Audio Notifikasi</span>
              <span style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 6,
                background: muted ? 'rgba(251,113,133,0.15)' : 'rgba(77,159,255,0.15)',
                color: muted ? '#fb7185' : 'var(--teal)',
                fontFamily: "'DM Mono', monospace"
              }}>
                {muted ? 'Bisu' : formatVolumePercent(volume)}
              </span>
            </div>
            <button
              type="button"
              className="btn"
              onClick={onToggleMute}
              style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28 }}
              aria-pressed={muted}
              aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            >
              {muted ? 'Nyalakan' : 'Bisukan'}
            </button>
          </div>

          {/* Slider Volume */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              <label htmlFor="sm-vol-slider" style={{ margin: 0, cursor: 'pointer' }}>Volume Master</label>
              <span style={{ fontFamily: "'DM Mono', monospace" }}>{formatVolumePercent(volume)}</span>
            </div>
            <input
              id="sm-vol-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              disabled={muted}
              onChange={handleSliderChange}
              aria-label="Volume master audio"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(volume * 100)}
              aria-valuetext={formatVolumePercent(volume)}
              style={{ width: '100%', cursor: muted ? 'not-allowed' : 'pointer', accentColor: 'var(--teal)' }}
            />
          </div>

          {/* Preset Buttons */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Preset Cepat:</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {VOLUME_PRESETS.map((preset) => {
                const isActive = !muted && Math.abs(volume - preset) < 0.02
                const pct = Math.round(preset * 100)
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePreset(preset)}
                    className="btn-preset"
                    aria-pressed={isActive}
                    title={`Set volume ke ${pct}%`}
                    style={{
                      flex: '1 1 0',
                      minWidth: 54,
                      padding: '5px 8px',
                      fontSize: 12,
                      fontFamily: "'DM Mono', monospace",
                      fontWeight: 600,
                      borderRadius: 8,
                      border: isActive ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.12)',
                      background: isActive ? 'rgba(77,159,255,0.15)' : 'rgba(255,255,255,0.04)',
                      color: isActive ? 'var(--teal)' : '#cbd5e1',
                      cursor: 'pointer',
                      transition: 'all .15s'
                    }}
                  >
                    {pct}%
                  </button>
                )
              })}
            </div>
          </div>

          {/* Test Audio Controls */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Uji Sampel Audio:</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestAudio('done')}
                disabled={muted}
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Dengarkan arpeggio nada sukses task selesai"
              >
                <IconPlay size={14} style={{ color: '#10e5a0' }} />
                Task Done
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestAudio('select')}
                disabled={muted}
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Dengarkan blip klik seleksi agent/objek 3D"
              >
                <IconPlay size={14} style={{ color: 'var(--teal)' }} />
                Blip Klik
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestAudio('fail')}
                disabled={muted}
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Dengarkan nada alert peringatan task gagal"
              >
                <IconPlay size={14} style={{ color: '#fb7185' }} />
                Task Fail
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestAudio('urgent')}
                disabled={muted}
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Dengarkan nada alert prioritas urgent"
              >
                <IconPlay size={14} style={{ color: '#EF4444' }} />
                Task Urgent
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestAudio('ambience')}
                disabled={muted}
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Dengarkan sampel desir ruangan kantor 3D (HVAC tone)"
              >
                <IconPlay size={14} style={{ color: '#38bdf8' }} />
                Hum Ruang
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => handleTestAudio('card')}
                disabled={muted}
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Dengarkan efek tactile kartu Kanban (drag & drop)"
              >
                <IconPlay size={14} style={{ color: '#f59e0b' }} />
                Kartu Kanban
              </button>
            </div>
            {testTip && (
              <div role="status" aria-live="polite" style={{ fontSize: 11, marginTop: 6, color: muted ? '#fb7185' : 'var(--teal)' }}>
                {testTip}
              </div>
            )}
          </div>

          {/* Ambience Ruangan Kantor (Hum HVAC & Room Tone) */}
          <div style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: ambienceOn ? 8 : 0 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Ambience Ruangan (Hum Kantor)</span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: ambienceOn && !muted ? 'rgba(16,229,160,0.15)' : 'rgba(255,255,255,0.06)', color: ambienceOn && !muted ? '#10e5a0' : 'var(--text-tertiary)', fontFamily: "'DM Mono', monospace" }}>
                    {muted ? 'TERBUNGKAM' : (ambienceOn ? 'AKTIF' : 'NONAKTIF')}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Desir pendingin ruangan (HVAC) & dengung lembut tech office
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={handleToggleAmbience}
                aria-pressed={ambienceOn}
                aria-label="Toggle ambience ruangan kantor"
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  height: 'auto',
                  minHeight: 28,
                  borderColor: ambienceOn && !muted ? 'var(--teal)' : 'rgba(255,255,255,0.12)',
                  color: ambienceOn && !muted ? 'var(--teal)' : '#cbd5e1'
                }}
              >
                {ambienceOn ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            {ambienceOn && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                  <span>Level Ambience:</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", color: '#cbd5e1' }}>{formatAmbiencePercent(ambienceVol)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={ambienceVol}
                  onChange={handleAmbienceVolChange}
                  disabled={muted}
                  aria-label="Volume ambience ruangan"
                  style={{ width: '100%', cursor: muted ? 'not-allowed' : 'pointer', accentColor: 'var(--teal)' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── BAGIAN VISUAL & KONTROL ── */}
        <div className="settings-section" style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#fff', marginBottom: 10 }}>Visual Ruangan 3D</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <IconTag size={16} />
                <span>Label Nama & Posisi Agen</span>
              </div>
              <button
                type="button"
                className="btn"
                onClick={handleToggleNames}
                aria-pressed={namesOn}
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28 }}
              >
                {namesOn ? 'Tampak' : 'Sembunyi'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <IconRotate size={16} />
                <span>Putar Otomatis Kamera</span>
              </div>
              <button
                type="button"
                className="btn"
                onClick={handleToggleRotate}
                aria-pressed={rotOn}
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28 }}
              >
                {rotOn ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                {cyberpunk ? <IconSun size={16} style={{ color: '#F59E0B' }} /> : <IconMoon size={16} style={{ color: 'var(--teal)' }} />}
                <span>Pencahayaan Ruang</span>
              </div>
              <button
                type="button"
                className="btn"
                onClick={onToggleTheme}
                aria-pressed={cyberpunk}
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28 }}
              >
                {cyberpunk ? 'Mode Gelap' : 'Mode Terang'}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Shortcut: <kbd style={{ padding: '2px 4px', background: 'rgba(255,255,255,0.08)', borderRadius: 4 }}>O</kbd> buka pengaturan · <kbd style={{ padding: '2px 4px', background: 'rgba(255,255,255,0.08)', borderRadius: 4 }}>M</kbd> mute
          </span>
          <button type="button" className="btn primary" onClick={onClose}>
            Selesai
          </button>
        </div>
      </div>
    </div>
  )
}
