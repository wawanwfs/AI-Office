// Logika data→teks papan proyek (murni, tanpa canvas/THREE) — diekstrak dari
// projectboard.js agar bisa di-unit-test: persen progres, banner review/gagal,
// item per kolom kanban, dan segmen strip status bawah.

// persen selesai; 0 bila tak ada task total
export function computePct(T) {
  return T && T.total ? Math.round((T.done / T.total) * 100) : 0
}

// subjudul di bawah judul papan
export function subtitle(T, timeStr) {
  let sub = 'Data live · task engine + SaaS · ' + (timeStr || '')
  if (T && T.review) sub += ' · review ' + T.review
  if (T && T.failed) sub += ' · gagal ' + T.failed
  return sub
}

// chip banner [teks, warna]; kosong bila tidak ada task bermasalah
export function bannerParts(T) {
  const parts = []
  if (!T) return parts
  if (T.failed) parts.push(['GAGAL ' + T.failed, '#ef4444'])
  if (T.review) parts.push(['REVIEW ' + T.review, '#448AFF'])
  return parts
}

// baris banner (nama task failed/review terbaru) — null bila tak relevan
export function bannerNames(T) {
  if (!T) return null
  const parts = bannerParts(T)
  const has = (st) => (T.recent || []).some(r => r.status === st)
  if (!parts.length || !(has('failed') || has('review'))) return null
  const items = (T.recent || []).filter(r => r.status === 'failed' || r.status === 'review').slice(0, 3)
  return parts.map(p => p[0]).join(' · ') + ' — ' + items.map(r => '#' + r.id + ' ' + (r.title || '').slice(0, 24)).join('  ·  ')
}

// item kartu per kolom kanban (0 antri, 1 jalan, 2 selesai) — maks 6
export function columnItems(T, i) {
  const want = i === 0 ? 'pending' : i === 1 ? 'running' : 'done'
  return ((T && T.recent) || []).filter(r => r.status === want).slice(0, 6)
}

// segmen strip bawah [{txt, col}] dari snapshot penuh (saas + agents)
export function stripSegments(snap) {
  const segs = []
  const s = (snap && snap.saas) || {}
  segs.push({ txt: 'SaaS', col: '#448AFF' })
  if (s.online) {
    const st = s.stats || {}
    segs.push({ txt: (st.tenants || (s.tenants || []).length) + ' tenant', col: '#10E5A0' })
    segs.push({ txt: (st.conversations || 0) + ' chat', col: '#8fa3bd' })
    segs.push({ txt: (st.messages || 0) + ' pesan', col: '#8fa3bd' })
    segs.push({ txt: 'online', col: '#10E5A0' })
    const act = (s.tenants || []).slice(-1)[0]
    if (act && act.name) segs.push({ txt: 'terbaru: ' + act.name, col: '#F59E0B' })
  } else {
    segs.push({ txt: 'offline', col: '#ef4444' })
  }
  const ags = (snap && snap.agents) || []
  if (ags.length) {
    segs.push({ txt: '·', col: '#44506a' })
    segs.push({ txt: 'AGENT', col: '#448AFF' })
    ags.forEach(a => segs.push({ txt: a.name + ' ' + (a.status === 'Up' ? '●' : '○'), col: a.status === 'Up' ? '#10E5A0' : '#ef4444' }))
  }
  return segs
}
