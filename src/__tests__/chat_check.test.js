// Unit test chat_check.js — deteksi pasangan percakapan & cooldown chat.
import { describe, it, expect } from 'vitest';
import { nearbyPairs, tickCooldown, CHAT_RADIUS, CHAT_COOLDOWN_SEC } from '../scene/parts/chat_check.js';

const p = (x, z, o = {}) => ({ x, z, visible: true, cooldown: 0, ...o });

describe('konstanta chat', () => {
  it('radius historis 1.5', () => expect(CHAT_RADIUS).toBe(1.5));
  it('cooldown historis 8 detik', () => expect(CHAT_COOLDOWN_SEC).toBe(8));
});

describe('nearbyPairs', () => {
  it('pasangan dekat terdeteksi', () => {
    const out = nearbyPairs([p(0, 0), p(1, 0)]);
    expect(out).toHaveLength(1);
    expect(out[0][0].x).toBe(0);
    expect(out[0][1].x).toBe(1);
  });

  it('pasangan jauh (> radius) diabaikan', () => {
    expect(nearbyPairs([p(0, 0), p(2, 0)])).toHaveLength(0);
  });

  it('tepat di boundary 1.5 dianggap dekat (tanda < pada jarak)', () => {
    expect(nearbyPairs([p(0, 0), p(1.49, 0)])).toHaveLength(1);
    expect(nearbyPairs([p(0, 0), p(1.51, 0)])).toHaveLength(0);
  });

  it('orang yang tidak visible tidak pernah ikut', () => {
    expect(nearbyPairs([p(0, 0, { visible: false }), p(0.5, 0)])).toHaveLength(0);
  });

  it('dua-duanya invisible → tidak ada pasangan', () => {
    expect(nearbyPairs([p(0, 0, { visible: false }), p(0.5, 0, { visible: false })])).toHaveLength(0);
  });

  it('cooldown a > 0 memblok pasangan', () => {
    expect(nearbyPairs([p(0, 0, { cooldown: 3 }), p(0.5, 0)])).toHaveLength(0);
  });

  it('cooldown b > 0 juga memblok', () => {
    expect(nearbyPairs([p(0, 0), p(0.5, 0, { cooldown: 1 })])).toHaveLength(0);
  });

  it('cooldown 0 / undefined tidak memblok', () => {
    expect(nearbyPairs([p(0, 0, { cooldown: undefined }), p(0.5, 0, { cooldown: 0 })])).toHaveLength(1);
  });

  it('tiga orang berkelompok → tiga pasangan (i<j)', () => {
    const ppl = [p(0, 0), p(0.5, 0), p(1, 0)];
    expect(nearbyPairs(ppl)).toHaveLength(3);
  });

  it('radius bisa di-inject', () => {
    expect(nearbyPairs([p(0, 0), p(2, 0)], 2.5)).toHaveLength(1);
  });

  it('jarak dihitung 2D (x,z), beda y tak relevan', () => {
    expect(nearbyPairs([p(0, 0), p(0, 1.4)])).toHaveLength(1);
  });

  it('jarak diagonal hypot benar (3-4-5)', () => {
    const ppl = [p(0, 0), p(3, 4)];
    expect(nearbyPairs(ppl, 5.1)).toHaveLength(1);
    expect(nearbyPairs(ppl, 4.9)).toHaveLength(0);
  });

  it('urutan pasangan mengikuti urutan input (stabil)', () => {
    const a = p(0, 0), b = p(0.5, 0), c = p(1, 0);
    const out = nearbyPairs([a, b, c]);
    expect(out[0]).toEqual([a, b]);
    expect(out[1]).toEqual([a, c]);
    expect(out[2]).toEqual([b, c]);
  });

  it('array kosong / satu orang → tanpa pasangan', () => {
    expect(nearbyPairs([])).toHaveLength(0);
    expect(nearbyPairs([p(0, 0)])).toHaveLength(0);
  });
});

describe('tickCooldown', () => {
  it('mengurangi dengan delta detik', () => {
    expect(tickCooldown(8, 0.5)).toBeCloseTo(7.5);
  });

  it('tidak pernah negatif (clamp 0)', () => {
    expect(tickCooldown(0.1, 0.5)).toBe(0);
    expect(tickCooldown(0, 1)).toBe(0);
  });

  it('undefined diperlakukan sebagai 0', () => {
    expect(tickCooldown(undefined, 0.016)).toBe(0);
  });

  it('delta besar langsung nol-kan cooldown', () => {
    expect(tickCooldown(8, 8)).toBe(0);
  });

  it('delta kecil (0.016 @60fps) mengurangi proporsional — bukan bug lama yang konstan per frame', () => {
    let cd = 8;
    for (let i = 0; i < 60; i++) cd = tickCooldown(cd, 1 / 60); // 1 detik nyata @60fps
    expect(cd).toBeCloseTo(7, 5);
  });
  it('guard anti-poisoning: cd non-finite (NaN/±Infinity) → 0 (bukan NaN yang macet)', () => {
    expect(tickCooldown(NaN, 0.016)).toBe(0);
    expect(tickCooldown(Infinity, 1)).toBe(0);
    expect(tickCooldown(-Infinity, 1)).toBe(0);
  });
  it('guard anti-poisoning: delta non-finite → 0 (tanpa penurunan)', () => {
    expect(tickCooldown(8, NaN)).toBe(0);
    expect(tickCooldown(8, Infinity)).toBe(0);
    expect(tickCooldown(8, -Infinity)).toBe(0);
  });
});

// ── Siklus 172 — REGRESI FATAL lunch-crash ──────────────────────────────
// checkConversations (OfficeScene) dulu membaca .walker/.home LANGSUNG di
// objek pembungkus hasil nearbyPairsPure ({a, visible, x, z, cooldown}) —
// field itu ada di wrapper.a, bukan di wrapper → `a.home.y` melempar
// TypeError per-frame begitu dua agen terlihat berdekatan (< CHAT_RADIUS).
// Repro live 2×: animate() crash tiap frame → KANTOR BEKU TOTAL sepanjang
// jam makan siang 12:00-13:00 (agen mengerumuni kafe), sim clock ikut berhenti.
// Kontrak di bawah mengunci bentuk pasangan yang dikonsumsi pemanggil runtime:
// pasangan = [wrapperA, wrapperB], agen asli di .a — konsumen WAJIB unwrap.
describe('nearbyPairs — kontrak pasangan utk pemanggil runtime (regresi lunch-crash 172)', () => {
  const mk = (id, x, z, visible = true, cooldown = 0) => ({
    a: { id, home: { x, y: 0, z }, agent: { hex: '#fff' } },
    visible, x, z, cooldown,
  });

  it('setiap pasangan adalah [wrapper, wrapper] dgn agen asli di .a — bukan agen langsung', () => {
    const A = mk('a', 0, 0), B = mk('b', 1, 0);
    const pairs = nearbyPairs([A, B], 1.5);
    expect(pairs.length).toBe(1);
    const [pa, pb] = pairs[0]; // pairs = array of [wrapperA, wrapperB]
    expect(pa.a && pa.a.id).toBe('a'); // agen asli TIDAK di posisi wrapper
    expect(pb.a && pb.a.id).toBe('b');
    expect(pa.walker).toBeUndefined(); // wrapper tak punya field scene — sumber bug lama
  });

  it('pola konsumsi runtime: unwrap .a dulu → akses home/agent AMAN (dulu: TypeError reading y)', () => {
    const A = mk('a', 2, 2), B = mk('b', 2.5, 2);
    for (const [pa, pb] of nearbyPairs([A, B], 1.5)) {
      const a = pa.a, b = pb.a;
      expect(() => (a.walker && a.walker.visible ? a.walker.position.y : a.home.y) || 0).not.toThrow();
      expect(a.home.y).toBe(0);
      expect(b.agent.hex).toBe('#fff');
    }
  });

  it('dua agen dalam radius saat lunch (kafe) → tetap menghasilkan pasangan (jalur yang dulu crash)', () => {
    // posisi kafe kampus: cluster sempit — banyak pasangan < 1.5
    const ppl = [
      mk('a', -6.0, 5.6), mk('b', -6.4, 5.8), mk('c', -5.7, 6.0),
      mk('d', -6.2, 5.4, true, 8), // satu cooldown → tak memblok pasangan lain
    ];
    const pairs = nearbyPairs(ppl, 1.5);
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    for (const [pa] of pairs) expect(typeof pa.a.home.y).toBe('number');
  });
});
