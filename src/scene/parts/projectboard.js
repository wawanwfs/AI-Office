// Papan proyek nyata WFS PROJECT di dinding kantor.
// Menggantikan kanban statis: kartu diambil dari data task engine sungguhan via /wfs-project,
// diperbarui otomatis setiap 60 detik. Jika fetch gagal → fallback ke data terakhir.
// Modul murni-canvas; dipasang di OfficeScene dengan satu pemanggilan.

import { computePct, clip, cardY, CARD_H, subtitle as subLine, bannerParts, bannerLayout, columnItems, cardMeta, stripLayout, STRIP_GAP, STRIP_LEFT, STRIP_RIGHT } from './projectboard_data.js'
import { applyPollResult, connectionBadge, nextPollDelay } from '../../lib/connection_spec.js'

// Polling adaptif papan 3D: cadence sehat tetap 60 dtk (perilaku lama), tapi
// saat fetch gagal jeda mengikuti backoff eksponensial 5→10→20→40→80s (cap 80s)
// dari connection_spec — browser tak lagi menghantam gateway mati tiap 60 dtk.
const BOARD_POLL_HEALTHY_MS = 60000

export function createProjectBoard(office, THREE) {
  // --- kanvas papan ---
  const W = 1536, H = 840
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')

  const tex = new THREE.CanvasTexture(cv)
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 4.04),
    new THREE.MeshBasicMaterial({ map: tex, fog: false })
  )
  mesh.position.set(-8.35, 2.6, 13.3)
  mesh.rotation.y = Math.PI
  mesh.renderOrder = 5
  office.add(mesh)
  // bingkai elegan (mengelilingi papan proyek secara presisi, tidak menabrak dinding samping)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(7.65, 4.25, .05), new THREE.MeshLambertMaterial({ color: 0x1A263E }))
  frame.position.set(-8.35, 2.6, 13.28)
  frame.userData.__keep = 1 // jangan ikut fade dinding belakang (wallFade collect)
  office.add(frame)

  // --- data ---
  let snap = null
  let lastOk = 0
  // Tracker kesehatan koneksi gateway — paritas dengan chip HUD (.conn-chip):
  // live / stale (data basi tapi papan masih layak) / down (belum pernah sukses).
  let conn = applyPollResult(null, { ok: false, error: 'init' }, 0)

  async function pull() {
    if (document.visibilityState === 'hidden') return
    try {
      const r = await fetch('/wfs-project')
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const d = await r.json()
      if (d && d.tasks) { snap = d; lastOk = Date.now() }
      conn = applyPollResult(conn, { ok: true })
      draw()
    } catch {
      conn = applyPollResult(conn, { ok: false, error: 'offline' })
      draw() // segarkan strip segera: badge koneksi berubah tanpa menunggu tick 60 dtk
    }
  }



  function roundRect(x, y, w, h, r) {
    g.beginPath()
    g.moveTo(x + r, y)
    g.arcTo(x + w, y, x + w, y + h, r)
    g.arcTo(x + w, y + h, x, y + h, r)
    g.arcTo(x, y + h, x, y, r)
    g.arcTo(x, y, x + w, y, r)
    g.closePath()
  }

  function draw() {
    if (!snap) return
    const T = snap.tasks || {}
    const pct = computePct(T)

    // latar
    g.fillStyle = '#10192b'; g.fillRect(0, 0, W, H)
    g.strokeStyle = '#2c3e5c'; g.lineWidth = 4; g.strokeRect(6, 6, W - 12, H - 12)

    // judul
    g.fillStyle = '#10E5A0'
    g.font = 'bold 52px sans-serif'; g.textAlign = 'left'
    g.fillText('WFS PROJECT: SOFTWARE HOUSE', 36, 66)
    g.fillStyle = '#8fa3bd'; g.font = '30px sans-serif'
    let sub = subLine(T, new Date(lastOk).toLocaleTimeString('id-ID'))
    g.fillText(sub, 36, 112)

    // progress bar
    g.fillStyle = 'rgba(255,255,255,.08)'; roundRect(36, 132, W - 72, 28, 10); g.fill()
    const grd = g.createLinearGradient(36, 0, W - 36, 0)
    grd.addColorStop(0, '#10E5A0'); grd.addColorStop(1, '#448AFF')
    g.fillStyle = grd; roundRect(36, 132, Math.max(12, (W - 72) * pct / 100), 28, 10); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'right'
    g.fillText(pct + '% selesai', W - 40, 154)

    // banner review/gagal: task yang butuh perhatian tidak boleh tak terlihat
    if (T.failed || T.review) {
      const parts = bannerParts(T)
      const full = bannerLayout(T, { budget: W - 88, text: t => g.measureText(t).width })
      if (full) {
        g.font = 'bold 24px sans-serif'
        const nameStr = full.names.join('  ·  ')
        const bw = g.measureText(parts.map(p => p[0]).join(' · ') + ' — ').width + g.measureText('  ·  ').width * (full.names.length - 1) + g.measureText(nameStr).width + 44
        g.fillStyle = 'rgba(239,68,68,.12)'; roundRect((W - bw) / 2, 166, bw, 34, 8); g.fill()
        g.strokeStyle = 'rgba(239,68,68,.5)'; g.lineWidth = 2; roundRect((W - bw) / 2, 166, bw, 34, 8); g.stroke()
        g.textAlign = 'left'
        let tx = (W - bw) / 2 + 22
        parts.forEach(([txt, col]) => {
          g.fillStyle = col; g.fillText(txt, tx, 190); tx += g.measureText(txt).width + 14
        })
        g.fillStyle = '#cfd8e3'; g.font = '600 24px sans-serif'
        full.names.forEach((nm, i) => {
          if (i > 0) { tx += g.measureText('  ·  ').width; g.fillText('  ·  ', tx, 190); tx += g.measureText('  ·  ').width }
          g.fillText(nm, tx, 190); tx += g.measureText(nm).width
        })
        g.textAlign = 'left'
      }
    }

    // tiga kolom: Antri / Jalan / Selesai
    const cols = [
      ['ANTRI', '#9aa7b8', T.pending || 0],
      ['JALAN', '#F59E0B', T.running || 0],
      ['SELESAI', '#10E5A0', T.done || 0],
    ]
    cols.forEach(([t, c, n], i) => {
      const x = 34 + i * 496
      g.fillStyle = '#17233a'; roundRect(x, 210, 470, 578, 12); g.fill()
      g.fillStyle = c; g.font = 'bold 36px sans-serif'; g.textAlign = 'center'
      g.fillText(t + ' (' + n + ')', x + 235, 238)

      // kartu task nyata per status (dari recent) — 6 kartu pas di dalam kolom (tanpa ketiban strip bawah)
      const items = columnItems(T, i)
      items.forEach((r, ri) => {
        const y = cardY(ri)
        const meta = cardMeta(r)
        const cardCol = meta ? meta.statusColor : c
        // kartu: latar gelap solid + border warna status + teks putih terang (kontras tinggi)
        g.fillStyle = '#0d1524'; roundRect(x + 22, y, 426, CARD_H, 10); g.fill()
        g.strokeStyle = cardCol; g.lineWidth = 4; roundRect(x + 22, y, 426, CARD_H, 10); g.stroke()
        g.fillStyle = '#ffffff'
        g.font = '600 26px sans-serif'; g.textAlign = 'left'
        const title = meta ? meta.formattedTitle : ('#' + r.id + ' ' + clip((r.title || ''), 30))
        g.fillText(title, x + 44, y + 33, 392)
        g.fillStyle = cardCol; g.font = '600 22px sans-serif'
        const stText = meta ? meta.statusText : (r.status === 'done' ? '✓ selesai' : r.status)
        g.fillText(stText, x + 44, y + 63)
      })
      if (!items.length) {
        g.fillStyle = 'rgba(255,255,255,.25)'; g.font = '26px sans-serif'; g.textAlign = 'center'
        g.fillText(i === 2 ? 'semua beres' : 'kosong', x + 235, 320)
      }
    })
    // strip bawah: live SaaS bantuin + agent docker (band latar + divider)
    g.fillStyle = '#0b1424'; roundRect(20, 794, W - 40, 32, 8); g.fill()
    g.strokeStyle = '#2c3e5c'; g.lineWidth = 2; roundRect(20, 794, W - 40, 32, 8); g.stroke()
    g.font = '22px sans-serif'; g.textAlign = 'left'
    // layout strip sadar-lebar: buang segmen prioritas-rendah bila total melebihi
    // lebar strip (diukur dengan font sungguhan) — agen tak perlu terdorong keluar
    g.font = '22px sans-serif'
    const layout = stripLayout(snap, {
      budget: W - STRIP_LEFT - STRIP_RIGHT - 26,
      gap: STRIP_GAP,
      text: t => g.measureText(t).width,
    })
    g.font = '22px sans-serif'; g.textAlign = 'left'
    let sx = STRIP_LEFT
    // Badge koneksi gateway (paritas chip HUD .conn-chip): titik berwarna + label
    // di awal strip, prioritas tertinggi (tak pernah ikut dibuang stripLayout).
    const cb = connectionBadge(conn)
    const dotCol = cb.tone === 'ok' ? '#10E5A0' : cb.tone === 'warn' ? '#F59E0B' : '#ef4444'
    g.fillStyle = dotCol
    g.beginPath(); g.arc(sx + 6, 810, 5, 0, Math.PI * 2); g.fill()
    sx += 18
    g.fillStyle = cb.tone === 'ok' ? '#8fa3bd' : dotCol
    g.fillText(cb.label, sx, 817)
    sx += g.measureText(cb.label).width + STRIP_GAP
    layout.kept.forEach(sg => { g.fillStyle = sg.col; g.fillText(sg.txt, sx, 817); sx += g.measureText(sg.txt).width + STRIP_GAP })
    tex.needsUpdate = true
  }

  // SaaS line: gambar ringkasan SaaS di strip bawah frame? (opsional di scene: cukup papan task)
  // Polling adaptif: rantai setTimeout — delay dari tracker (60 dtk sehat,
  // backoff eksponensial 5→80s saat gateway mati, pulih → 60 dtk lagi).
  // Jadwal pertama menyusul pull awal selesai, agar delay dihitung dari tracker segar.
  let pollTimer = null
  let pollStopped = false
  function schedulePoll() {
    pollTimer = setTimeout(async () => {
      await pull()
      if (!pollStopped) schedulePoll()
    }, nextPollDelay(conn, BOARD_POLL_HEALTHY_MS))
  }
  pull().then(() => { if (!pollStopped) schedulePoll() })
  // Umur data pada badge koneksi (label "Sinkron N dtk/mnt lalu" saat stale)
  // harus berdetak: segarkan strip tiap 30s. draw() menggambar hanya bila snap ada,
  // jadi aman sebelum fetch pertama berhasil.
  const connIv = setInterval(() => { if (conn.state !== 'live') draw() }, 30000)
  // Tab kembali terlihat → segarkan data segera (jangan tunggu tick 60 detik);
  // tab hidden → interval tick di-skip agar tidak fetch sia-sia.
  let pageHidden = document.visibilityState === 'hidden'
  function onVis() {
    const hidden = document.visibilityState === 'hidden'
    if (!hidden && pageHidden) pull()
    pageHidden = hidden
  }
  document.addEventListener('visibilitychange', onVis)

  // Paksa papan selalu penuh terlihat: wallFade mengklon material & menurunkan opacity
  // saat dinding belakang memudar — data proyek harus tidak terpengaruh.
  const forceVisible = setInterval(() => {
    if (mesh.material.opacity !== undefined && mesh.material.opacity < 1) {
      mesh.material.opacity = 1
      mesh.material.transparent = false
      mesh.visible = true
    }
  }, 500)

  function destroy() {
    pollStopped = true // hentikan rantai poll adaptif
    if (pollTimer !== null) clearTimeout(pollTimer)
    clearInterval(connIv); clearInterval(forceVisible); document.removeEventListener('visibilitychange', onVis)
  }
  return { destroy, refresh: pull, mesh, frame }
}
