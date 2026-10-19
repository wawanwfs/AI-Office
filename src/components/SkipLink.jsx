import React, { useState } from 'react'

// Skip link: tersembunyi sampai menerima fokus keyboard (Tab pertama),
// lalu muncul di atas segalanya. Membuka Papan Task bila tertutup dan
// memindahkan fokus ke kolom input chat WfsPanel (panel kerja utama).
export default function SkipLink() {
  const [focus, setFocus] = useState(false)
  const go = (e) => {
    e.preventDefault()
    const trg = document.querySelector('button[aria-controls="wfs-panel"]')
    let panel = document.getElementById('wfs-panel')
    if (!panel && trg) { trg.click(); panel = document.getElementById('wfs-panel') }
    const target = panel && (panel.querySelector('textarea, input') || panel)
    if (target) target.focus()
  }
  return (
    <a href="#wfs-panel" className={'skip-link' + (focus ? ' vis' : '')}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onClick={go}>
      Lewati ke panel Chat
    </a>
  )
}
