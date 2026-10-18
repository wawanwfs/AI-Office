// Papan proyek nyata dibantuin.com di dinding kantor.
// Menggantikan kanban statis: kartu diambil dari data task engine sungguhan via /wfs-project,
// diperbarui otomatis setiap 60 detik. Jika fetch gagal → fallback ke data terakhir.
// Modul murni-canvas; dipasang di OfficeScene dengan satu pemanggilan.

export function createProjectBoard(office, THREE) {
  // --- kanvas papan ---
  const W = 1536, H = 840
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')

  const tex = new THREE.CanvasTexture(cv)
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 3.06),
    new THREE.MeshBasicMaterial({ map: tex, fog: false })
  )
  mesh.position.set(-8.6, 2.55, 9.8)
  mesh.rotation.y = Math.PI
  office.add(mesh)
  // bingkai (menggantikan bingkai kanban lama yang dipasang di OfficeScene)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.75, 3.21, .05), new THREE.MeshLambertMaterial({ color: 0x23324d }))
  frame.position.set(-8.6, 2.55, 9.75)
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
    g.font = 'bold 52px sans-serif'; g.textAlign = 'left'
    g.fillText('PROYEK: dibantuin.com', 36, 66)
    g.fillStyle = '#8fa3bd'; g.font = '30px sans-serif'
    g.fillText('Data live · task engine + SaaS · ' + new Date(lastOk).toLocaleTimeString('id-ID'), 36, 112)

    // progress bar
    g.fillStyle = 'rgba(255,255,255,.08)'; roundRect(36, 132, W - 72, 28, 10); g.fill()
    const grd = g.createLinearGradient(36, 0, W - 36, 0)
    grd.addColorStop(0, '#10E5A0'); grd.addColorStop(1, '#448AFF')
    g.fillStyle = grd; roundRect(36, 132, Math.max(12, (W - 72) * pct / 100), 28, 10); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'right'
    g.fillText(pct + '% selesai', W - 40, 154)

    // tiga kolom: Antri / Jalan / Selesai
    const cols = [
      ['ANTRI', '#9aa7b8', T.pending || 0],
      ['JALAN', '#F59E0B', T.running || 0],
      ['SELESAI', '#10E5A0', T.done || 0],
    ]
    cols.forEach(([t, c, n], i) => {
      const x = 34 + i * 496
      g.fillStyle = '#17233a'; roundRect(x, 178, 470, 630, 12); g.fill()
      g.fillStyle = c; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'
      g.fillText(t + ' (' + n + ')', x + 235, 226)

      // kartu task nyata per status (dari recent)
      const items = (T.recent || []).filter(r => r.status === (i === 0 ? 'pending' : i === 1 ? 'running' : 'done')).slice(0, 6)
      items.forEach((r, ri) => {
        const y = 252 + ri * 92
        // kartu: latar gelap solid + border warna status + teks putih terang (kontras tinggi)
        g.fillStyle = '#0d1524'; roundRect(x + 22, y, 426, 82, 10); g.fill()
        g.strokeStyle = c; g.lineWidth = 4; roundRect(x + 22, y, 426, 82, 10); g.stroke()
        g.fillStyle = '#ffffff'
        g.font = '600 26px sans-serif'; g.textAlign = 'left'
        const title = '#' + r.id + ' ' + (r.title || '').slice(0, 30)
        g.fillText(title, x + 44, y + 36, 392)
        g.fillStyle = c; g.font = '600 22px sans-serif'
        g.fillText((r.status === 'done' ? '✓ selesai' : r.status), x + 44, y + 68)
      })
      if (!items.length) {
        g.fillStyle = 'rgba(255,255,255,.25)'; g.font = '26px sans-serif'; g.textAlign = 'center'
        g.fillText(i === 2 ? 'semua beres 🎉' : 'kosong', x + 235, 320)
      }
    })
    // strip bawah: live SaaS bantuin + agent docker (band latar + divider)
    g.fillStyle = '#0b1424'; roundRect(20, 794, W - 40, 32, 8); g.fill()
    g.strokeStyle = '#2c3e5c'; g.lineWidth = 2; roundRect(20, 794, W - 40, 32, 8); g.stroke()
    const s = snap.saas || {}
    g.font = '22px sans-serif'; g.textAlign = 'left'
    let sx = 44
    const seg = (txt, col) => { g.fillStyle = col; g.fillText(txt, sx, 817); sx += g.measureText(txt).width + 26 }
    seg('SaaS', '#448AFF')
    if (s.online) {
      const st = s.stats || {}
      seg((st.tenants || (s.tenants || []).length) + ' tenant', '#10E5A0')
      seg((st.conversations || 0) + ' chat', '#8fa3bd')
      seg((st.messages || 0) + ' pesan', '#8fa3bd')
      seg('online', '#10E5A0')
      const act = (s.tenants || []).slice(-1)[0]
      if (act && act.name) seg('terbaru: ' + act.name, '#F59E0B')
    } else {
      seg('offline', '#ef4444')
    }
    const ags = snap.agents || []
    if (ags.length) {
      seg('·', '#44506a')
      seg('AGENT', '#448AFF')
      ags.forEach(a => seg(a.name + ' ' + (a.status === 'Up' ? '●' : '○'), a.status === 'Up' ? '#10E5A0' : '#ef4444'))
    }
    tex.needsUpdate = true
  }

  // SaaS line: gambar ringkasan SaaS di strip bawah frame? (opsional di scene: cukup papan task)
  pull()
  const iv = setInterval(pull, 60000)

  // Paksa papan selalu penuh terlihat: wallFade mengklon material & menurunkan opacity
  // saat dinding belakang memudar — data proyek harus tidak terpengaruh.
  const forceVisible = setInterval(() => {
    if (mesh.material.opacity !== undefined && mesh.material.opacity < 1) {
      mesh.material.opacity = 1
      mesh.material.transparent = false
      mesh.visible = true
    }
  }, 500)

  function destroy() { clearInterval(iv); clearInterval(forceVisible) }
  return { destroy, refresh: pull, mesh }
}
