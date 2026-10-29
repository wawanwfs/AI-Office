import React from 'react'
import {
  getAmbienceStatusLabel,
  getAmbienceTooltip,
  getAmbienceAriaLabel,
} from '../scene/parts/sound_spec.js'
import { phaseStyleFor } from '../scene/parts/office_phase.js'

// Pill kiri-atas: jam + fase kantor live + slider waktu + status gateway nyata + widget kontrol cepat audio ambience kantor.
export default function HUD({
  time,
  timeValue,
  status,
  statusKind,
  conn,
  phase,
  perf,
  onTimeChange,
  ambienceEnabled = false,
  ambienceVolume = 0.35,
  muted = false,
  onToggleAmbience,
  onCycleAmbienceVolume,
  onOpenSettings,
}) {
  const isHumActive = !!(ambienceEnabled && !muted)
  const statusLabel = getAmbienceStatusLabel({ enabled: ambienceEnabled, muted, volume: ambienceVolume })
  const tooltipText = getAmbienceTooltip({ enabled: ambienceEnabled, muted, volume: ambienceVolume })
  const ariaLabelText = getAmbienceAriaLabel({ enabled: ambienceEnabled, muted, volume: ambienceVolume })
  // Fase kantor: label yang dikirim scene (via onStatusUpdate → App) dipetakan
  // ke tone/ikon. Scene belum lapor (phase kosong/non-string) → chip disembunyikan.
  const phaseInfo = phaseStyleFor(phase)

  const handleClick = (e) => {
    if (e.shiftKey && onCycleAmbienceVolume) {
      e.preventDefault()
      onCycleAmbienceVolume()
    } else if (onToggleAmbience) {
      onToggleAmbience(e)
    }
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    if (onOpenSettings) onOpenSettings()
  }

  return (
    <div className="hud" role="group" aria-label="Waktu simulasi dan status">
      <span className="clock">{time}</span>
      {phaseInfo && (
        <span
          className={`phase-chip ${phaseInfo.tone}`}
          role="status"
          title={`Fase kantor: ${phaseInfo.label} ${phaseInfo.icon}`}
        ><i aria-hidden="true" />{phaseInfo.label}</span>
      )}
      <input
        type="range"
        min="0"
        max="1440"
        step="1"
        value={timeValue}
        aria-label="Waktu simulasi"
        aria-valuetext={time}
        onChange={e => onTimeChange(parseInt(e.target.value, 10))}
      />
      <span className={'stat ' + (statusKind || '')} role="status"><i />{status}</span>

      {conn && (
        <span
          className={`conn-chip ${conn.state}`}
          role="status"
          title={conn.detail}
          aria-label={`Status sinkronisasi: ${conn.detail}`}
        >
          <i aria-hidden="true" />{conn.label}
        </span>
      )}

      {/* Siklus 147: chip kualitas render GPU — FPS live + status tangga adaptif.
          perf null = scene belum mengukur (2 dtk pertama) / UI-only → disembunyikan. */}
      {perf && (
        <span
          className={`perf-chip ${perf.state}`}
          role="status"
          title={perf.detail}
          aria-label={`Kualitas render: ${perf.detail}`}
        >
          <i aria-hidden="true" />{perf.label}
        </span>
      )}

      {onToggleAmbience && (
        <>
          <span className="hud-sep" aria-hidden="true" />
          <button
            type="button"
            className={`hud-amb-btn${isHumActive ? ' active' : ''}${muted ? ' muted' : ''}`}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            title={tooltipText}
            aria-label={ariaLabelText}
            aria-pressed={isHumActive}
          >
            <span className="hud-amb-wave" aria-hidden="true">
              <span className="hud-amb-bar bar-1" />
              <span className="hud-amb-bar bar-2" />
              <span className="hud-amb-bar bar-3" />
            </span>
            <span className="hud-amb-label">{statusLabel}</span>
          </button>
        </>
      )}
    </div>
  )
}
