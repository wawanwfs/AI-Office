import { describe, it, expect } from 'vitest'
import {
  computePct, clip, cardY, CARD_H, COLUMN_BOTTOM, subtitle, bannerParts, bannerNames, bannerLayout,
  columnItems, stripSegments, clampStripTenant, stripLayout, BASE_DROP_ORDER, OMNI_DROP_ORDER, STRIP_GAP,
  normalizeTaskStatus, formatTaskId, formatCardStatus, formatCardTitle, cardMeta,
} from '../scene/parts/projectboard_data.js'

describe('cardY (tata letak kartu tidak menabrak strip bawah)', () => {
  it('6 kartu terakhir masih di dalam kolom', () => {
    const maxItems = columnItems({ recent: new Array(10).fill(0).map((_, i) => ({ id: i, status: 'done', title: 't' })) }, 2).length
    expect(maxItems).toBe(6)
    expect(cardY(maxItems - 1) + CARD_H).toBeLessThanOrEqual(COLUMN_BOTTOM)
  })
  it('kartu berurutan tanpa tumpang tindih', () => {
    expect(cardY(1) - cardY(0)).toBeGreaterThanOrEqual(CARD_H)
    expect(cardY(0)).toBe(248)
  })
})

describe('clip (judul kartu tanpa potong tengah kata)', () => {
  it('teks pendek tak diubah', () => {
    expect(clip('Admin dashboard', 30)).toBe('Admin dashboard')
    expect(clip('', 30)).toBe('')
    expect(clip(null, 30)).toBe('')
  })
  it('teks panjang dipotong di spasi + ellipsis', () => {
    const out = clip('Chat widget embeddable (Next.js)', 30)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(31)
    expect(out).not.toMatch(/\w\.\.\.$/) // tak ada potongan kata seperti "(Next.j…"
    expect(out.endsWith('(Next.js…')).toBe(false)
  })
  it('tanpa spasi dekat batas: potong apa adanya + ellipsis', () => {
    const out = clip('Supercalifragilisticexpialidocious', 30)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBe(31)
  })
})

describe('computePct', () => {
  it('membulatkan done/total', () => {
    expect(computePct({ total: 23, done: 15 })).toBe(65)
    expect(computePct({ total: 3, done: 0 })).toBe(0)
    expect(computePct({ total: 4, done: 4 })).toBe(100)
  })
  it('0 bila tak ada total / T null', () => {
    expect(computePct({})).toBe(0)
    expect(computePct(null)).toBe(0)
  })
  it('dijepit ke 0–100 (done>total / negatif) & aman terhadap NaN', () => {
    expect(computePct({ total: 5, done: 12 })).toBe(100)
    expect(computePct({ total: 5, done: -3 })).toBe(0)
    expect(computePct({ total: 5, done: undefined })).toBe(0)
    expect(computePct({ total: 5, done: NaN })).toBe(0)
    expect(computePct({ total: 2, done: 1 })).toBe(50)
  })
})

describe('subtitle', () => {
  it('menyertakan review & gagal bila ada', () => {
    const s = subtitle({ review: 2, failed: 1 }, '10:00')
    expect(s).toContain('review 2')
    expect(s).toContain('gagal 1')
    expect(s).toContain('10:00')
  })
  it('bersih bila tidak ada masalah', () => {
    expect(subtitle({}, '10:00')).not.toContain('review')
  })
})

describe('bannerParts & bannerNames', () => {
  const T = { failed: 1, review: 2, recent: [
    { id: 7, title: 'task gagal', status: 'failed' },
    { id: 9, title: 'task review', status: 'review' },
  ] }
  it('parts: GAGAL merah, REVIEW biru, urut itu', () => {
    expect(bannerParts(T)).toEqual([['GAGAL 1', '#ef4444'], ['REVIEW 2', '#448AFF']])
  })
  it('names: gabung prefix + daftar task terbaru (maks 3)', () => {
    const n = bannerNames(T)
    expect(n).toContain('GAGAL 1 · REVIEW 2')
    expect(n).toContain('#7 task gagal')
    expect(n).toContain('#9 task review')
  })
  it('null bila tidak ada failed/review atau recent kosong', () => {
    expect(bannerNames({ failed: 1, recent: [{ status: 'done' }] })).toBeNull()
    expect(bannerNames({})).toBeNull()
    expect(bannerNames(null)).toBeNull()
  })
})

describe('columnItems', () => {
  const T = { recent: [
    { id: 1, status: 'pending' }, { id: 2, status: 'running' }, { id: 3, status: 'done' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: 10 + i, status: 'done' })),
  ] }
  it('filter per kolom & maks 6 item', () => {
    expect(columnItems(T, 0).map(r => r.id)).toEqual([1])
    expect(columnItems(T, 1).map(r => r.id)).toEqual([2])
    expect(columnItems(T, 2)).toHaveLength(6)
  })
  it('T null / tanpa recent → array kosong', () => {
    expect(columnItems(null, 2)).toEqual([])
    expect(columnItems({}, 0)).toEqual([])
  })
})

describe('bannerLayout (banner sadar-lebar, tidak meluber)', () => {
  const T = { failed: 1, review: 1, recent: [
    { id: 7, title: 'task gagal panjang sekali sekalian', status: 'failed' },
    { id: 9, title: 'task review lain', status: 'review' },
  ] }
  const m = (budget) => ({ budget, text: t => t.length * 10 })
  it('null bila tidak relevan', () => {
    expect(bannerLayout(null, m(5000))).toBeNull()
    expect(bannerLayout({ failed: 1, recent: [{ status: 'done' }] }, m(5000))).toBeNull()
  })
  it('muat → semua nama tampil utuh (tanpa slice(0,24))', () => {
    const L = bannerLayout(T, m(5000))
    expect(L.names).toHaveLength(2)
    expect(L.names[0]).toContain('panjang sekali sekalian')
    expect(L.truncated).toBe(false)
  })
  it('budget sempit → buang item dari belakang, head tetap', () => {
    const L = bannerLayout(T, m(900))
    expect(L.names).toHaveLength(1)
    expect(L.head).toContain('GAGAL')
    expect(L.truncated).toBe(true)
  })
  it('invariant: hasil muat dalam budget atau terpangkas di batas kata', () => {
    for (const b of [700, 900, 1100, 1400, 2000]) {
      const L = bannerLayout(T, m(b))
      const w = m(b).text(L.head) + m(b).text('—  ·  ') * L.names.length + L.names.reduce((a, t) => a + m(b).text(t), 0)
      expect(w).toBeLessThanOrEqual(b)
    }
  })
})

describe('stripSegments', () => {
  it('SaaS online: tenant/chat/pesan + agent Up/Down dengan simbol benar', () => {
    const segs = stripSegments({ saas: { online: true, stats: { tenants: 3, conversations: 12, messages: 40 }, tenants: [{ name: 'Budi' }] }, agents: [{ name: 'be1', status: 'Up' }, { name: 'qa1', status: 'Exited' }] })
    const texts = segs.map(s => s.txt)
    expect(texts).toContain('SaaS')
    expect(texts).toContain('3 tenant')
    expect(texts).toContain('12 chat')
    expect(texts).toContain('40 pesan')
    expect(texts).toContain('online')
    expect(texts).toContain('terbaru: Budi')
    expect(texts).toContain('be1 ●')
    expect(texts).toContain('qa1 ○')
  })
  it('fallback tenants dari array bila stats.tenants hilang', () => {
    const segs = stripSegments({ saas: { online: true, tenants: [{}, {}, {}] } })
    expect(segs.map(s => s.txt)).toContain('3 tenant')
  })
  it('SaaS offline → segmen offline merah; agents tetap tampil', () => {
    const segs = stripSegments({ saas: { online: false }, agents: [{ name: 'fe1', status: 'Up' }] })
    const off = segs.find(s => s.txt === 'offline')
    expect(off.col).toBe('#ef4444')
    expect(segs.map(s => s.txt)).toContain('AGENT')
  })
  it('tanpa snapshot → minimal segmen offline', () => {
    const segs = stripSegments(null)
    expect(segs[0]).toEqual({ txt: 'SaaS', col: '#448AFF' })
    expect(segs.map(s => s.txt)).toContain('offline')
    expect(segs.some(s => s.txt === 'AGENT')).toBe(false)
  })
  it('omniroute online/offline disertakan dengan port & status yang sesuai', () => {
    const segsOnline = stripSegments({
      saas: { online: true },
      agents: [],
      omniroute: { online: true, port: 20128 },
    })
    expect(segsOnline.map(s => s.txt)).toContain('OMNI')
    expect(segsOnline.map(s => s.txt)).toContain(':20128 ●')
    const omniSeg = segsOnline.find(s => s.txt === ':20128 ●')
    expect(omniSeg.col).toBe('#10E5A0')

    const segsOffline = stripSegments({
      saas: { online: true },
      agents: [],
      omniroute: { online: false },
    })
    expect(segsOffline.map(s => s.txt)).toContain('offline')
    const offOmni = segsOffline.find(s => s.txt === 'offline' && s.__isOmni)
    expect(offOmni.col).toBe('#ef4444')
  })
})

describe('clampStripTenant', () => {
  it('nama pendek utuh', () => {
    expect(clampStripTenant('Toko Berkah')).toBe('Toko Berkah')
  })
  it('nama panjang dipangkas di batas kata + …', () => {
    const c = clampStripTenant('Kopi Kenangan Sentral Raya Cabang Utama', 24)
    expect(c.length).toBeLessThanOrEqual(25)
    expect(c.endsWith('…')).toBe(true)
    expect(c.endsWith('Sentral…')).toBe(true) // tidak memotong tengah kata
  })
  it('kata tunggal sangat panjang → fallback potong', () => {
    const c = clampStripTenant('X'.repeat(40), 24)
    expect(c).toBe('X'.repeat(24) + '…')
  })
  it('guard falsy', () => {
    expect(clampStripTenant('')).toBe('')
    expect(clampStripTenant(null)).toBe('')
  })
})

describe('stripLayout', () => {
  const snap = { saas: { online: true, stats: { tenants: 3, conversations: 120, messages: 4560 }, tenants: [{ name: 'Toko Berkah Jaya Abadi Sentral' }] }, agents: [{ name: 'be1', status: 'Up' }, { name: 'fe1', status: 'Up' }] }
  // pengukur deterministik: 10px per karakter
  const m = (budget) => ({ budget, gap: 26, text: t => t.length * 10 })
  it('muat → semua segmen tampil, tak ada yang dibuang', () => {
    const { kept, dropped } = stripLayout(snap, m(5000))
    expect(kept.some(s => s.txt.startsWith('terbaru:'))).toBe(true)
    expect(dropped).toEqual([])
  })
  it('budget sempit → terbaru dibuang dulu, label SaaS & agen tetap', () => {
    const { kept, dropped } = stripLayout(snap, m(1073))
    expect(dropped).toContain('latest')
    expect(kept.some(s => s.txt.startsWith('terbaru:'))).toBe(false)
    expect(kept[0].txt).toBe('SaaS')
    expect(kept.map(s => s.txt)).toContain('AGENT')
  })
  it('budget sangat sempit → hanya segmen wajib (SaaS + agen)', () => {
    const { kept, dropped } = stripLayout(snap, m(400))
    expect(dropped).toEqual(['latest', 'messages', 'chats', 'online'])
    expect(kept.every(s => !['latest', 'messages', 'chats', 'online'].includes(s.txt))).toBe(true)
    expect(kept.map(s => s.txt)).toContain('be1 ●')
  })
  it('invariant: lebar hasil selalu ≤ budget bila masih ada yang bisa dibuang', () => {
    for (const budget of [300, 700, 1000, 1400]) {
      const { kept } = stripLayout(snap, m(budget))
      const w = kept.reduce((a, s) => a + s.txt.length * 10 + 26, 0) - 26
      const mandatory = kept.filter(s => !['latest', 'messages', 'chats', 'online'].includes(s.txt))
      if (mandatory.reduce((a, s) => a + s.txt.length * 10 + 26, 0) - 26 <= budget) {
        expect(w).toBeLessThanOrEqual(budget)
      }
    }
  })
  it('omniroute tampil bila muat dan dibuang secara bertahap bila budget menyempit', () => {
    const snapOmni = {
      ...snap,
      omniroute: { online: true, port: 20128 },
    }
    const wide = stripLayout(snapOmni, m(5000))
    expect(wide.kept.some(s => s.txt === 'OMNI')).toBe(true)
    expect(wide.kept.some(s => s.txt === ':20128 ●')).toBe(true)
    expect(wide.dropped).toEqual([])

    // budget sangat ketat: omni dibuang sebelum agen
    const tight = stripLayout(snapOmni, m(400))
    expect(tight.dropped).toContain('omni')
    expect(tight.kept.some(s => s.txt === 'OMNI')).toBe(false)
    expect(tight.kept.some(s => s.txt === 'be1 ●')).toBe(true)
  })
})

describe('drop order — prioritas buang segmen strip', () => {
  it('BASE_DROP_ORDER: terbaru → pesan → chat → online', () => {
    expect(BASE_DROP_ORDER).toEqual(['latest', 'messages', 'chats', 'online'])
  })
  it('OMNI_DROP_ORDER menyisipkan omni sebelum online (omni dikorbankan dulu)', () => {
    expect(OMNI_DROP_ORDER).toEqual(['latest', 'messages', 'chats', 'omni', 'online'])
    // invariant: urutan BASE adalah prefix OMNI minus 'omni'
    const base = BASE_DROP_ORDER.filter(k => k !== 'omni')
    expect(base).toEqual(['latest', 'messages', 'chats', 'online'])
    expect(OMNI_DROP_ORDER.indexOf('omni')).toBeLessThan(OMNI_DROP_ORDER.indexOf('online'))
  })
  it('STRIP_GAP default 26px', () => {
    expect(STRIP_GAP).toBe(26)
  })
})

describe('normalizeTaskStatus & format helper kartu kanban 3D', () => {
  it('normalizeTaskStatus: memetakan alias status ke 4 kelompok baku', () => {
    expect(normalizeTaskStatus('completed')).toBe('done')
    expect(normalizeTaskStatus('finished')).toBe('done')
    expect(normalizeTaskStatus('resolved')).toBe('done')
    expect(normalizeTaskStatus('success')).toBe('done')
    expect(normalizeTaskStatus('DONE')).toBe('done')

    expect(normalizeTaskStatus('in_progress')).toBe('running')
    expect(normalizeTaskStatus('active')).toBe('running')
    expect(normalizeTaskStatus('working')).toBe('running')
    expect(normalizeTaskStatus('running')).toBe('running')

    expect(normalizeTaskStatus('ready')).toBe('pending')
    expect(normalizeTaskStatus('queued')).toBe('pending')
    expect(normalizeTaskStatus('waiting')).toBe('pending')
    expect(normalizeTaskStatus('todo')).toBe('pending')
    expect(normalizeTaskStatus('backlog')).toBe('pending')
    expect(normalizeTaskStatus('pending')).toBe('pending')
    expect(normalizeTaskStatus(null)).toBe('pending')
    expect(normalizeTaskStatus('')).toBe('pending')

    expect(normalizeTaskStatus('failed')).toBe('failed')
    expect(normalizeTaskStatus('error')).toBe('failed')
    expect(normalizeTaskStatus('review')).toBe('review')
    expect(normalizeTaskStatus('qa')).toBe('review')
  })

  it('formatTaskId: memformat ID berprefix task- maupun ID angka', () => {
    expect(formatTaskId('task-9da32873')).toBe('#9da32873')
    expect(formatTaskId('task-e8e731a4')).toBe('#e8e731a4')
    expect(formatTaskId(21)).toBe('#21')
    expect(formatTaskId('#42')).toBe('#42')
    expect(formatTaskId(null)).toBe('')
    expect(formatTaskId('')).toBe('')
  })

  it('formatCardStatus: teks status kartu kanban 3D', () => {
    expect(formatCardStatus('completed')).toBe('✓ selesai')
    expect(formatCardStatus('done')).toBe('✓ selesai')
    expect(formatCardStatus('running')).toBe('⚡ berjalan')
    expect(formatCardStatus('in_progress')).toBe('⚡ berjalan')
    expect(formatCardStatus('failed')).toBe('✕ gagal')
    expect(formatCardStatus('review')).toBe('🔍 review')
    expect(formatCardStatus('ready')).toBe('⏳ antri')
    expect(formatCardStatus('pending')).toBe('⏳ antri')
  })

  it('formatCardTitle: judul kartu dengan ID dan kliping rapi', () => {
    expect(formatCardTitle({ id: 'task-123', title: 'Belajar Tiga Dimensi' })).toBe('#123 Belajar Tiga Dimensi')
    expect(formatCardTitle({ id: 5, title: 'Short' })).toBe('#5 Short')
    expect(formatCardTitle(null)).toBe('')
  })

  it('cardMeta: menghasilkan metadata lengkap untuk render kanvas', () => {
    const metaDone = cardMeta({ id: 'task-abc', title: 'Fitur Utama', status: 'completed' })
    expect(metaDone.formattedId).toBe('#abc')
    expect(metaDone.statusKey).toBe('done')
    expect(metaDone.statusText).toBe('✓ selesai')
    expect(metaDone.statusColor).toBe('#10E5A0')

    const metaReady = cardMeta({ id: 'task-xyz', title: 'API Gateway', status: 'ready' })
    expect(metaReady.statusKey).toBe('pending')
    expect(metaReady.statusText).toBe('⏳ antri')
    expect(metaReady.statusColor).toBe('#9aa7b8')
    expect(cardMeta(null)).toBeNull()
  })

  it('columnItems mengelompokkan task server WFS yang berstatus ready dan completed', () => {
    const wfsSnapshot = {
      recent: [
        { id: 'task-9da32873', title: 'Develop: E-Commerce API', status: 'ready' },
        { id: 'task-e8e731a4', title: 'Develop: WFS Project 31A4', status: 'completed' },
        { id: 'task-67386a35', title: 'Develop: WFS TaskFlow SaaS', status: 'completed' },
        { id: 'task-9a927f44', title: 'Develop: E-Commerce API', status: 'ready' },
      ],
    }
    const antri = columnItems(wfsSnapshot, 0)
    const selesai = columnItems(wfsSnapshot, 2)
    expect(antri.map(t => t.id)).toEqual(['task-9da32873', 'task-9a927f44'])
    expect(selesai.map(t => t.id)).toEqual(['task-e8e731a4', 'task-67386a35'])
  })
})
