// Unit test data dialog & frasa agent (chatPhrases, roleTalk, COLLAB_PAIRS,
// pickCollab, clampBubbleText, collabDuration) — diekstrak murni dari
// OfficeScene.js agar bisa diuji tanpa scene/THREE.
import { describe, it, expect } from 'vitest';
import { chatPhrases, roleTalk, COLLAB_PAIRS, pickCollab, clampBubbleText, collabDuration, LINE_SEC } from '../scene/parts/dialog.js';
import { updateBubbles } from '../scene/parts/bubbles.js';

describe('dialog: data', () => {
  it('chatPhrases tidak kosong, semua string unik non-empty', () => {
    expect(chatPhrases.length).toBeGreaterThan(10);
    expect(new Set(chatPhrases).size).toBe(chatPhrases.length);
    chatPhrases.forEach((p) => expect(typeof p).toBe('string'));
  });

  it('roleTalk: 12 role terdaftar, tiap role punya ≥2 baris non-empty', () => {
    expect(Object.keys(roleTalk).length).toBe(12);
    for (const [role, lines] of Object.entries(roleTalk)) {
      expect(lines.length, role).toBeGreaterThanOrEqual(2);
      lines.forEach((l) => expect(l.trim().length, role).toBeGreaterThan(0));
    }
  });

  it('COLLAB_PAIRS: 10 pasangan, pasangan tidak duplikat (urut aba), tiap pasangan ≥4 baris', () => {
    expect(COLLAB_PAIRS.length).toBe(10);
    const keys = COLLAB_PAIRS.map(([a, b]) => [a, b].sort().join('|'));
    expect(new Set(keys).size).toBe(10);
    for (const [, , lines] of COLLAB_PAIRS) {
      expect(lines.length).toBeGreaterThanOrEqual(4);
      lines.forEach((l) => expect(typeof l).toBe('string'));
    }
  });

  it('semua role di roleTalk & pasangan COLLAB_PAIRS konsisten: baris bergantian genap=UI/UX berbicara pertama', () => {
    // baris indeks 0 selalu diucapkan pihak pertama; pastikan teks tidak identik antar baris berurutan
    for (const [, , lines] of COLLAB_PAIRS) {
      for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
    }
  });
});

describe('dialog: pickCollab', () => {
  const agents = [
    { agent: { role: 'Frontend Dev' }, state: 'sitting', name: 'fe' },
    { agent: { role: 'Backend' }, state: 'sitting', name: 'be' },
    { agent: { role: 'QA' }, state: 'sitting', name: 'qa' },
    { agent: { role: 'Growth' }, state: 'walking_out', name: 'gr' }, // tidak sitting → tak pernah jadi partner
  ];
  const fe = agents[0];

  it('role yang punya pasangan (frontend↔backend, frontend↔QA) selalu dapat partner sitting', () => {
    for (let i = 0; i < 50; i++) {
      const c = pickCollab(fe, agents);
      expect(c).not.toBeNull();
      expect(['be', 'qa']).toContain(c.partner.name);
      expect(c.lines.length).toBeGreaterThanOrEqual(4);
      expect(typeof c.first).toBe('boolean');
    }
  });

  it('role tanpa pasangan → null', () => {
    const lonely = { agent: { role: 'Astronaut' }, state: 'sitting' };
    expect(pickCollab(lonely, agents)).toBeNull();
  });

  it('self tidak dianggap partner; partner tidak walking (state ≠ sitting disaring)', () => {
    const solo = [{ agent: { role: 'Backend' }, state: 'sitting', name: 'be2' }];
    const b = { agent: { role: 'Backend' }, state: 'sitting', name: 'be' };
    expect(pickCollab(b, solo)).toBeNull(); // hanya dirinya
    // Growth walking_out bukan partner sah untuk PM
    const pm = { agent: { role: 'Project Manager' }, state: 'sitting' };
    expect(pickCollab(pm, agents)).toBeNull();
  });

  it('role case-insensitive & substring match (Project Manager ↔ Engineer)', () => {
    const eng = { agent: { role: 'senior engineer' }, state: 'sitting', name: 'eng' };
    const pm = { agent: { role: 'pm project manager' }, state: 'sitting', name: 'pm' };
    const c = pickCollab(pm, [pm, eng]);
    expect(c.partner.name).toBe('eng');
  });
});

describe('dialog: clampBubbleText', () => {
  it('teks pendek utuh, panjang >32 dipangkas 31 + ellipsis, non-string dikonversi', () => {
    expect(clampBubbleText('halo')).toBe('halo');
    const long = 'a'.repeat(40);
    const out = clampBubbleText(long);
    expect(out.length).toBe(32);           // 31 + '…'
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, 31)).toBe('a'.repeat(31));
    expect(clampBubbleText(12345)).toBe('12345');
  });

  it('teks tepat 32 karakter tidak dipangkas', () => {
    const t = 'b'.repeat(32);
    expect(clampBubbleText(t)).toBe(t);
  });
});

describe('dialog: collabDuration', () => {
  it('LINE_SEC 1.8; durasi = baris × LINE_SEC + 1.2 jeda akhir', () => {
    expect(LINE_SEC).toBe(1.8);
    expect(collabDuration(['a', 'b', 'c', 'd'])).toBeCloseTo(1.8 * 4 + 1.2);
    expect(collabDuration([])).toBeCloseTo(1.2);
  });
});

describe('bubbles: updateBubbles', () => {
  const mk = (anchor) => ({
    sprite: { position: { x: 0, y: 0, z: 0 }, material: { opacity: 0 } },
    life: 3.5, startY: 1.0, anchor: anchor || null,
  });

  it('life berkurang per delta & fade-in naik dari 0', () => {
    const b = mk();
    updateBubbles([b], 0.1, { remove: () => {} });
    expect(b.life).toBeCloseTo(3.4);
    expect(b.sprite.material.opacity).toBeGreaterThan(0);
  });

  it('anchor mengikuti posisi pembicara (x/z dari anchor)', () => {
    const b = mk({ x: 5, z: 7, y: 2.6 });
    updateBubbles([b], 0.1, { remove: () => {} });
    expect(b.sprite.position.x).toBe(5);
    expect(b.sprite.position.z).toBe(7);
    // y = anchor.y + 1.35 + (3 - life) * .10
    expect(b.sprite.position.y).toBeCloseTo(2.6 + 1.35 + (3 - 3.4) * 0.10);
  });

  it('tanpa anchor: float up dari startY', () => {
    const b = mk();
    updateBubbles([b], 0.2, { remove: () => {} });
    expect(b.sprite.position.y).toBeCloseTo(1.0 + (3 - 3.3) * 0.12);
  });

  it('life ≤ 0: sprite diremove via callback & dikeluarkan dari array', () => {
    const removed = [];
    const b = mk();
    b.life = 0.01;
    const arr = [b];
    updateBubbles(arr, 0.5, { remove: (x) => removed.push(x) });
    expect(arr.length).toBe(0);
    expect(removed).toEqual([b]);
  });

  it('fade-out mendekati akhir: opacity turun kembali ke 0', () => {
    const b = mk();
    b.life = 0.2; // sudah lewat fade-in
    updateBubbles([b], 0.01, { remove: () => {} });
    expect(b.sprite.material.opacity).toBeCloseTo(1 * (0.19 / 0.5));
  });
});
