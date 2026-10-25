import React from 'react'

// Pill kiri-atas: jam + slider waktu + status gateway nyata.
export default function HUD({ time, timeValue, status, statusKind, onTimeChange }) {
  return (
    <div className="hud" role="group" aria-label="Waktu simulasi dan status">
      <span className="clock">{time}</span>
      <input type="range" min="0" max="1440" step="1" value={timeValue} aria-label="Waktu simulasi" aria-valuetext={time}
        onChange={e => onTimeChange(parseInt(e.target.value, 10))} />
      <span className={'stat ' + (statusKind || '')} role="status"><i />{status}</span>
    </div>
  )
}
