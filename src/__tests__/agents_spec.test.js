import { describe, it, expect } from 'vitest';
import { AGENTS, AGENTS_EXTRA, SCREENS, allAgents } from '../scene/parts/agents_spec.js';

describe('agents_spec — AGENTS utama (8)', () => {
  it('tepat 8 agen utama dengan urutan historis', () => {
    expect(AGENTS.map(a => a.name)).toEqual([
      'BANTUIN AI','BUDI','RIZKY','DEWI','ANDI','YOGA','MAYA','TONI'
    ]);
  });

  it('warna utama historis (hex string)', () => {
    const hexes = Object.fromEntries(AGENTS.map(a => [a.name, a.hex]));
    expect(hexes['BANTUIN AI']).toBe('#10E5A0');
    expect(hexes['BUDI']).toBe('#3B82F6');
    expect(hexes['RIZKY']).toBe('#22D3EE');
    expect(hexes['DEWI']).toBe('#F472B6');
    expect(hexes['ANDI']).toBe('#FBBF24');
    expect(hexes['YOGA']).toBe('#60A5FA');
    expect(hexes['MAYA']).toBe('#A78BFA');
    expect(hexes['TONI']).toBe('#34D399');
  });

  it('warna numerik color = parseInt(hex)', () => {
    for (const a of AGENTS) expect(a.color).toBe(parseInt(a.hex.replace('#',''),16));
  });

  it('role historis tiap agen', () => {
    const roles = Object.fromEntries(AGENTS.map(a => [a.name, a.role]));
    expect(roles['BANTUIN AI']).toBe('AI Customer Service');
    expect(roles['BUDI']).toBe('Backend Engineer');
    expect(roles['RIZKY']).toBe('Backend Engineer');
    expect(roles['DEWI']).toBe('Frontend Engineer');
    expect(roles['ANDI']).toBe('Frontend Engineer');
    expect(roles['YOGA']).toBe('Mobile Engineer');
    expect(roles['MAYA']).toBe('UI/UX Designer');
    expect(roles['TONI']).toBe('DevOps Engineer');
  });

  it('screen tiap agen adalah salah satu kosakata SCREENS', () => {
    for (const a of AGENTS) expect(SCREENS).toContain(a.screen);
  });

  it('setiap agen punya field lengkap: hair, shirt, pants', () => {
    for (const a of AGENTS) {
      for (const k of ['hair','shirt','pants']) {
        expect(Number.isFinite(a[k])).toBe(true);
        expect(a[k]).toBeGreaterThanOrEqual(0);
        expect(a[k]).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it('BANTUIN AI memakai kaos hijau tua 0x0B4F3A', () => {
    const b = AGENTS[0];
    expect(b.shirt).toBe(0x0B4F3A);
    expect(b.pants).toBe(0x08281F);
  });
});

describe('agents_spec — AGENTS_EXTRA (6)', () => {
  it('tepat 6 agen extra dengan urutan historis', () => {
    expect(AGENTS_EXTRA.map(a => a.name)).toEqual([
      'RINA','LINA','SARI','TRAINER AI','INTEGRATOR BOT','SUPPORT'
    ]);
  });

  it('warna utama historis (hex string)', () => {
    const hexes = Object.fromEntries(AGENTS_EXTRA.map(a => [a.name, a.hex]));
    expect(hexes['RINA']).toBe('#FB7185');
    expect(hexes['LINA']).toBe('#FB923C');
    expect(hexes['SARI']).toBe('#F59E0B');
    expect(hexes['TRAINER AI']).toBe('#8B5CF6');
    expect(hexes['INTEGRATOR BOT']).toBe('#06B6D4');
    expect(hexes['SUPPORT']).toBe('#84CC16');
  });

  it('role historis tiap agen extra', () => {
    const roles = Object.fromEntries(AGENTS_EXTRA.map(a => [a.name, a.role]));
    expect(roles['RINA']).toBe('QA Engineer');
    expect(roles['LINA']).toBe('Growth Marketing');
    expect(roles['SARI']).toBe('Project Manager');
    expect(roles['TRAINER AI']).toBe('AI Knowledge Engineer');
    expect(roles['INTEGRATOR BOT']).toBe('Integration Engineer');
    expect(roles['SUPPORT']).toBe('Customer Success');
  });

  it('screen tiap agen extra adalah salah satu kosakata SCREENS', () => {
    for (const a of AGENTS_EXTRA) expect(SCREENS).toContain(a.screen);
  });
});

describe('agents_spec — SCREENS & allAgents', () => {
  it('SCREENS berisi 6 jenis layar historis', () => {
    expect(SCREENS).toEqual(['terminal','charts','palette','deploy','map','docs','bugs','board']);
  });

  it('allAgents = 14 agen (8 utama + 6 extra) dengan urutan utama dulu', () => {
    const all = allAgents();
    expect(all.length).toBe(14);
    expect(all.slice(0,8)).toEqual(AGENTS);
    expect(all.slice(8)).toEqual(AGENTS_EXTRA);
  });

  it('nama agen unik di seluruh 14', () => {
    const names = allAgents().map(a => a.name);
    expect(new Set(names).size).toBe(14);
  });

  it('allAgents menerima argumen kustom (injection test)', () => {
    const a = [{name:'X', hex:'#000000', color:0, role:'r', screen:'docs', hair:0, shirt:0, pants:0}];
    const b = [{name:'Y', hex:'#111111', color:1, role:'r', screen:'docs', hair:0, shirt:0, pants:0}];
    expect(allAgents(a, b).map(x => x.name)).toEqual(['X','Y']);
  });

  it('hex semua agen valid: #RRGGBB', () => {
    for (const a of allAgents()) expect(a.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('color numerik & hex string konsisten di seluruh 14 agen', () => {
    for (const a of allAgents()) {
      expect(a.color).toBe(parseInt(a.hex.replace('#',''),16));
    }
  });
});
