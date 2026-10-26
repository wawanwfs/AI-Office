// Unit test data dialog & frasa agent (chatPhrases, roleTalk, COLLAB_PAIRS,
// pickCollab, clampBubbleText, collabDuration) — diekstrak murni dari
// OfficeScene.js agar bisa diuji tanpa scene/THREE.
import { describe, it, expect } from 'vitest';
import { chatPhrases, roleTalk, COLLAB_PAIRS, pickCollab, clampBubbleText, collabDuration, LINE_SEC, autoTalkDelay, autoTalkText } from '../scene/parts/dialog.js';
import { updateBubbles } from '../scene/parts/bubbles.js';

describe('dialog: data', () => {
  it('chatPhrases tidak kosong, semua string unik non-empty', () => {
    expect(chatPhrases.length).toBeGreaterThan(10);
    expect(new Set(chatPhrases).size).toBe(chatPhrases.length);
    chatPhrases.forEach((p) => expect(typeof p).toBe('string'));
  });

  it('roleTalk: 28 role terdaftar (16 historis + 12 spesialis kampus), tiap role punya ≥2 baris non-empty', () => {
    expect(Object.keys(roleTalk).length).toBe(28);
    for (const [role, lines] of Object.entries(roleTalk)) {
      expect(lines.length, role).toBeGreaterThanOrEqual(2);
      lines.forEach((l) => expect(l.trim().length, role).toBeGreaterThan(0));
    }
  });

  it('COLLAB_PAIRS: 20 pasangan (10 historis + 10 lintas domain spesialis), pasangan tidak duplikat (urut aba), tiap pasangan ≥4 baris', () => {
    expect(COLLAB_PAIRS.length).toBe(20);
    const keys = COLLAB_PAIRS.map(([a, b]) => [a, b].sort().join('|'));
    expect(new Set(keys).size).toBe(20);
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

  it('pemangkasan di batas kata: tidak memotong tengah kata', () => {
    const out = clampBubbleText('mengerjakan refactor widget dashboard sekarang');
    expect(out.endsWith('…')).toBe(true);
    // tanpa fragment kata yang terpotong: bagian sebelum '…' tidak berakhir di tengah kata asli
    const cut = out.slice(0, -1);
    expect('mengerjakan refactor widget dashboard sekarang'.startsWith(cut + ' ')).toBe(true);
  });

  it('kata tunggal sangat panjang (tanpa spasi) tetap dipangkas apa adanya', () => {
    const out = clampBubbleText('x'.repeat(40));
    expect(out.length).toBe(32);
    expect(out.endsWith('…')).toBe(true);
  });

  it('spasi dekat batas dipakai: hasil lebih pendek dari 31 huruf', () => {
    // spasi terakhir di posisi 25 (≥60% dari 32) → potong di situ
    const t = 'a'.repeat(25) + ' ' + 'b'.repeat(20);
    const out = clampBubbleText(t);
    expect(out).toBe('a'.repeat(25) + '…');
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

  it('anchor mengikuti posisi pembicara secara mulus (mendekati, bukan snap)', () => {
    const b = mk({ x: 5, z: 7, y: 2.6 });
    // spawn di posisi anchor → tidak ada lompatan frame pertama
    b.sprite.position.x = 5; b.sprite.position.z = 7; b.sprite.position.y = 2.6 + 1.35;
    updateBubbles([b], 0.1, { remove: () => {} });
    expect(b.sprite.position.x).toBe(5);
    expect(b.sprite.position.z).toBe(7);
    // y = base ter-damping + (3 - life) * .10 (drift float-up tetap eksak)
    expect(b.sprite.position.y).toBeCloseTo(2.6 + 1.35 + (3 - 3.4) * 0.10);
    // anchor berpindah jauh → bubble mendekat bertahap, bukan teleport
    b.anchor = { x: 50, z: 70, y: 2.6 };
    updateBubbles([b], 0.1, { remove: () => {} });
    expect(b.sprite.position.x).toBeGreaterThan(5);
    expect(b.sprite.position.x).toBeLessThan(50);
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

describe('dialog: autoTalk (murni)', () => {
  const adToni = { agent: { name: 'TONI' } };
  const adUnknown = { agent: { name: 'XYZ' } };

  it('autoTalkDelay: rentang 7000–15000 ms; rng kustom deterministik', () => {
    for (let i = 0; i < 200; i++) {
      const d = autoTalkDelay();
      expect(d).toBeGreaterThanOrEqual(7000);
      expect(d).toBeLessThanOrEqual(15000);
    }
    expect(autoTalkDelay({ random: () => 0 })).toBe(7000);
    expect(autoTalkDelay({ random: () => 1 })).toBe(15000);
  });

  it('autoTalkText: task running diprioritaskan, teks dipangkas clampBubbleText', () => {
    const rt = { byAgent: { t9: { id: 42, title: 'Judul task yang sangat panjang sekali melebihi tiga puluh dua karakter penuh' } } };
    const t = autoTalkText(adToni, rt, { TONI: 't9' });
    expect(t).toBe('Task #42: ' + clampBubbleText('Judul task yang sangat panjang sekali melebihi tiga puluh dua karakter penuh'));
    expect(t.length).toBeLessThanOrEqual('Task #42: '.length + 32);
  });

  it('autoTalkText: tanpa task → frasa per-role; agent tak dikenal → fallback', () => {
    expect(roleTalk.TONI).toContain(autoTalkText(adToni, null, {}));
    expect(autoTalkText(adUnknown, null, {})).toBe('“Fokus dulu…”');
    expect(roleTalk.TONI).toContain(autoTalkText(adToni, { byAgent: {} }, {}));
    const adWahyu = { agent: { name: 'WAHYU FS', role: 'Founder / CEO' } };
    expect(roleTalk['WAHYU FS']).toContain(autoTalkText(adWahyu, null, {}));
    const adTrainer = { agent: { name: 'TRAINER AI', role: 'AI Knowledge Engineer' } };
    expect(roleTalk['TRAINER AI']).toContain(autoTalkText(adTrainer, null, {}));
  });

  it('autoTalkText: agent null → null (pemanggil tidak membuat bubble)', () => {
    expect(autoTalkText(null, null, {})).toBeNull();
  });

  it('autoTalkText: pilihan frasa deterministik dengan rng kustom', () => {
    const t0 = autoTalkText(adToni, null, {}, { random: () => 0 });
    const t1 = autoTalkText(adToni, null, {}, { random: () => 0.9999 });
    expect(t0).toBe(roleTalk.TONI[0]);
    expect(roleTalk.TONI).toContain(t1);
  });

  it('autoTalkText: 12 spesialis kampus menghasilkan dialog khas teknis masing-masing', () => {
    const specialists = [
      { name: 'ARIS', role: 'Solution Architect' },
      { name: 'CLARA', role: 'UX Researcher' },
      { name: 'RIAN', role: 'Product Strategist' },
      { name: 'TARI', role: 'Visual Designer' },
      { name: 'FERRY', role: 'Database Engineer' },
      { name: 'GILANG', role: 'Senior Backend Lead' },
      { name: 'HENDRA', role: 'Cloud Infra Engineer' },
      { name: 'DONI', role: 'Site Reliability Eng' },
      { name: 'SECBOT', role: 'Security Engineer' },
      { name: 'BAGAS', role: 'DevSecOps Specialist' },
      { name: 'NINA', role: 'Release Manager' },
      { name: 'CITRA', role: 'Quality Governance Lead' }
    ];
    specialists.forEach(sp => {
      const ad = { agent: sp };
      const text = autoTalkText(ad, null, {});
      expect(roleTalk[sp.name]).toContain(text);
      expect(text).not.toBe('“Fokus dulu…”');
    });
  });

  it('pickCollab: spesialis multi-lantai berhasil kolaborasi lintas domain', () => {
    const campusAgents = [
      { agent: { name: 'ARIS', role: 'Solution Architect' }, state: 'sitting' },
      { agent: { name: 'GILANG', role: 'Senior Backend Lead' }, state: 'sitting' },
      { agent: { name: 'BAGAS', role: 'DevSecOps Specialist' }, state: 'sitting' },
      { agent: { name: 'SECBOT', role: 'Security Engineer' }, state: 'sitting' },
      { agent: { name: 'NINA', role: 'Release Manager' }, state: 'sitting' },
      { agent: { name: 'CITRA', role: 'Quality Governance Lead' }, state: 'sitting' },
    ];
    // ARIS berkolaborasi dengan BACKEND (GILANG) dan DEVSECOPS (BAGAS)
    const collabAris = pickCollab(campusAgents[0], campusAgents);
    expect(collabAris).not.toBeNull();
    expect(['GILANG', 'BAGAS']).toContain(collabAris.partner.agent.name);

    // SECBOT berkolaborasi dengan DEVSECOPS (BAGAS)
    const collabSec = pickCollab(campusAgents[3], campusAgents);
    expect(collabSec).not.toBeNull();
    expect(collabSec.partner.agent.name).toBe('BAGAS');

    // CITRA (Governance) berkolaborasi dengan NINA (Release)
    const collabGov = pickCollab(campusAgents[5], campusAgents);
    expect(collabGov).not.toBeNull();
    expect(collabGov.partner.agent.name).toBe('NINA');
  });
});
