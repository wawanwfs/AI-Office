// Logika data→teks papan proyek (murni, tanpa canvas/THREE) — diekstrak dari
// projectboard.js agar bisa di-unit-test: persen progres, banner review/gagal,
// item per kolom kanban, dan segmen strip status bawah.

// tata letak kartu kolom: y kartu ke-i (0..5) + tinggi, dijamin tidak menabrak strip bawah (y=794)
const CARD_TOP = 248, CARD_STEP = 88
export const CARD_H = 78, COLUMN_BOTTOM = 788
export function cardY(i) { return CARD_TOP + i * CARD_STEP }

// judul dipotong di batas kata, diberi '…' bila terpotong (jangan memotong di tengah kata)
import { clip } from '../../lib/clip.js'
export { clip }

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
  return parts.map(p => p[0]).join(' · ') + ' — ' + items.map(r => '#' + r.id + ' ' + (r.title || '')).join('  ·  ')
}

// layout banner sadar-lebar: ukur lebar dengan font sungguhan; bila melebihi budget,
// buang item terlama (dari belakang) berurutan lalu pangkas item terakhir di batas kata.
// Kembalikan { names: [teks per item], truncated: bool } — null bila tak relevan.
export function bannerLayout(T, measure) {
  const full = bannerNames(T)
  if (!full) return null
  const prefix = parts => parts.map(p => p[0]).join(' · ')
  const parts = bannerParts(T)
  const items = (T.recent || []).filter(r => r.status === 'failed' || r.status === 'review').slice(0, 3)
  const itemText = r => '#' + r.id + ' ' + (r.title || '')
  const budget = measure.budget
  const sepW = measure.text('—  ·  ')
  const fits = (n) => measure.text(prefix(parts) + ' — ') + sepW + n.reduce((a, t) => a + measure.text(t) + sepW, 0) <= budget
  let names = items.map(itemText)
  let truncated = false
  while (names.length > 1 && !fits(names)) { names.pop(); truncated = true }
  if (!fits(names)) {
    // buang nama task terakhir juga, lalu pangkas di batas kata
    truncated = true
    const head = prefix(parts) + ' — '
    const avail = Math.max(0, budget - measure.text(head) - sepW)
    names = [clip(names[0], Math.max(8, Math.round(avail / (measure.text('n') || 1))))]
  }
  return { head: prefix(parts) + ' — ', names, truncated }
}

// item kartu per kolom kanban (0 antri, 1 jalan, 2 selesai) — maks 6
export function columnItems(T, i) {
  const want = i === 0 ? 'pending' : i === 1 ? 'running' : 'done'
  return ((T && T.recent) || []).filter(r => r.status === want).slice(0, 6)
}

// segmen strip bawah [{txt, col}] dari snapshot penuh (saas + agents + omniroute)
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
    if (act && act.name) segs.push({ txt: 'terbaru: ' + clampStripTenant(act.name), col: '#F59E0B' })
  } else {
    segs.push({ txt: 'offline', col: '#ef4444' })
  }
  const ags = (snap && snap.agents) || []
  if (ags.length) {
    segs.push({ txt: '·', col: '#44506a' })
    segs.push({ txt: 'AGENT', col: '#448AFF' })
    ags.forEach(a => segs.push({ txt: a.name + ' ' + (a.status === 'Up' ? '●' : '○'), col: a.status === 'Up' ? '#10E5A0' : '#ef4444' }))
  }
  const omni = (snap && snap.omniroute) || null
  if (omni) {
    segs.push({ txt: '·', col: '#44506a' })
    segs.push({ txt: 'OMNI', col: '#448AFF' })
    segs.push({
      txt: omni.online ? (omni.port ? `:${omni.port} ●` : 'online') : 'offline',
      col: omni.online ? '#10E5A0' : '#ef4444',
      __isOmni: true,
    })
  }
  return segs
}

// Nama tenant di strip dipangkas di batas kata (pola clip) — nama panjang
// tidak boleh memakan seluruh lebar strip dan mendorong segmen agen keluar.
export function clampStripTenant(name, max = 24) {
  const n = String(name || '')
  if (n.length <= max) return n
  const cut = n.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp >= max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…'
}

// Wajib-segmen strip (label yang tidak boleh dibuang): label SaaS + status agen.
// stripLayout() memangkas segmen prioritas-rendah dari kanan sampai muat:
// urutan buang: 'terbaru: …' → '… pesan' → '… chat' → omniroute → online.
export const STRIP_GAP = 26, STRIP_LEFT = 44, STRIP_RIGHT = 44
export const BASE_DROP_ORDER = ['latest', 'messages', 'chats', 'online']
export const OMNI_DROP_ORDER = ['latest', 'messages', 'chats', 'omni', 'online']

export function stripLayout(snap, measure) {
  const segs = stripSegments(snap).map(sg => ({ ...sg }))
  const hasOmni = !!(snap && snap.omniroute)
  const dropOrder = hasOmni ? OMNI_DROP_ORDER : BASE_DROP_ORDER
  // tandai segmen yang boleh dibuang
  let inOmni = false
  segs.forEach(sg => {
    if (sg.txt.startsWith('terbaru: ')) sg.__drop = 'latest'
    else if (/ \d+ pesan$/.test(sg.txt)) sg.__drop = 'messages'
    else if (/ \d+ chat$/.test(sg.txt)) sg.__drop = 'chats'
    else if (sg.txt === 'online' && !inOmni && !sg.__isOmni) sg.__drop = 'online'
    else if (sg.txt === 'OMNI') {
      sg.__drop = 'omni'
      inOmni = true
    } else if (inOmni || sg.__isOmni) {
      sg.__drop = 'omni'
      inOmni = false
    }
  })
  // tandai pemisah '·' yang mendahului OMNI agar ikut terbuang saat OMNI dibuang
  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i].txt === '·' && segs[i + 1]?.__drop === 'omni') {
      segs[i].__drop = 'omni'
    }
  }
  const budget = measure.budget
  const gap = measure.gap ?? STRIP_GAP
  const width = (list) => list.reduce((a, s) => a + measure.text(s.txt) + gap, 0) - gap
  for (let i = 0; i <= dropOrder.length; i++) {
    const drops = new Set(dropOrder.slice(0, i))
    const kept = segs.filter(sg => !drops.has(sg.__drop))
    if (width(kept) <= budget) return { kept, dropped: [...drops] }
  }
  // tetap tak muat (layar sempit ekstrem): buang semua opsional + pangkas nama agen tidak mungkin — kembalikan minimal
  return { kept: segs.filter(sg => !sg.__drop), dropped: [...dropOrder] }
}
