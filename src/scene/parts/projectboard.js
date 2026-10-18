// Papan proyek nyata bantuin.com di dinding kantor.
// Menggantikan kanban statis: kartu diambil dari data task engine sungguhan via /wfs-project,
// diperbarui otomatis setiap 60 detik. Jika fetch gagal → fallback ke data terakhir.
// Modul murni-canvas; dipasang di OfficeScene dengan satu pemanggilan.

export function createProjectBoard(office, THREE) {
  // --- kanvas papan ---
  const W = 1024, H = 560
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')

  const tex = new THREE.CanvasTexture(cv)
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 2.52),
    new THREE.MeshBasicMaterial({ map: tex })
  )
  mesh.position.set(-8.6, 2.4, 9.2)
  mesh.rotation.y = Math.PI
  office.add(mesh)
  // bingkai (menggantikan bingkai kanban lama yang dipasang di OfficeScene)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.75, 2.67, .05), new THREE.MeshLambertMaterial({ color: 0x23324d }))
  frame.position.set(-8.6, 2.4, 9.25)
  office.add(frame)

  // --- data ---
  let snap = null
  let lastOk = 0

  async function pull() {
    try {
      const r = await fetch('/wfs-project')
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const d = await r.json()
      if (d && d.tasks) { snap = d; lastOk = Date.now() }
      draw()
    } catch { /* biarkan data terakhir tampil */ }
  }

  function chip(x, y, w, txt, col) {
    g.fillStyle = col
    const f = g.font
    g.font = 'bold 22px sans-serif'
    const tw = g.measureText(txt).width
    g.font = f
    g.fillStyle = 'rgba(255,255,255,.09)'
    roundRect(x, y - 20, Math.max(w, tw + 18), 28, 6); g.fill()
    g.fillStyle = col
    g.font = 'bold 22px sans-serif'
    g.textAlign = 'left'
    g.fillText(txt, x + 9, y)
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
    const pct = T.total ? Math.round((T.done / T.total) * 100) : 0

    // latar
    g.fillStyle = '#10192b'; g.fillRect(0, 0, W, H)
    g.strokeStyle = '#2c3e5c'; g.lineWidth = 4; g.strokeRect(6, 6, W - 12, H - 12)

    // judul
    g.fillStyle = '#10E5A0'
    g.font = 'bold 34px sans-serif'; g.textAlign = 'left'
    g.fillText('PROYEK: bantuin.com', 28, 52)
    g.fillStyle = '#8fa3bd'; g.font = '20px sans-serif'
    g.fillText('Data live · task engine + SaaS · ' + new Date(lastOk).toLocaleTimeString('id-ID'), 28, 82)

    // progress bar
    g.fillStyle = 'rgba(255,255,255,.08)'; roundRect(28, 100, W - 56, 20, 8); g.fill()
    const grd = g.createLinearGradient(28, 0, W - 28, 0)
    grd.addColorStop(0, '#10E5A0'); grd.addColorStop(1, '#448AFF')
    g.fillStyle = grd; roundRect(28, 100, Math.max(10, (W - 56) * pct / 100), 20, 8); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.textAlign = 'right'
    g.fillText(pct + '% selesai', W - 32, 116)

    // tiga kolom: Antri / Jalan / Selesai
    const cols = [
      ['ANTRI', '#9aa7b8', T.pending || 0],
      ['JALAN', '#F59E0B', T.running || 0],
      ['SELESAI', '#10E5A0', T.done || 0],
    ]
    cols.forEach(([t, c, n], i) => {
      const x = 24 + i * 332
      g.fillStyle = '#17233a'; roundRect(x, 138, 320, 396, 10); g.fill()
      g.fillStyle = c; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'
      g.fillText(t + ' (' + n + ')', x + 160, 176)

      // kartu task nyata per status (dari recent)
      const items = (T.recent || []).filter(r => r.status === (i === 0 ? 'pending' : i === 1 ? 'running' : 'done')).slice(0, 4)
      items.forEach((r, ri) => {
        const y = 196 + ri * 82
        g.fillStyle = c; roundRect(x + 16, y, 288, 72, 8); g.fill()
        g.fillStyle = 'rgba(0,0,0,.55)'
        g.font = '600 17px sans-serif'; g.textAlign = 'left'
        const title = '#' + r.id + ' ' + (r.title || '').slice(0, 30)
        g.fillText(title, x + 30, y + 30, 262)
        g.fillStyle = 'rgba(0,0,0,.4)'; g.font = '15px sans-serif'
        g.fillText((r.status === 'done' ? '✓ selesai' : r.status), x + 30, y + 56)
      })
      if (!items.length) {
        g.fillStyle = 'rgba(255,255,255,.25)'; g.font = '18px sans-serif'; g.textAlign = 'center'
        g.fillText(i === 2 ? 'semua beres 🎉' : 'kosong', x + 160, 250)
      }
    })
    tex.needsUpdate = true
  }

  // SaaS line: gambar ringkasan SaaS di strip bawah frame? (opsional di scene: cukup papan task)
  pull()
  const iv = setInterval(pull, 60000)

  function destroy() { clearInterval(iv) }
  return { destroy, refresh: pull }
}
