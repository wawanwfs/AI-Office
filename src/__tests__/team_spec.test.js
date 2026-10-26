import { describe, it, expect } from 'vitest';
import {
  TEAMS,
  findTeamByRole,
  findTeamByAgent,
  findTeamByKey,
  computeTeamStats,
  teamPodFocusTarget,
} from '../scene/parts/team_spec.js';

describe('team_spec — Definisi & Pemetaan Divisi Kerja Kampus WFS', () => {
  it('mendefinisikan 6 tim/divisi dengan konfigurasi lengkap', () => {
    expect(TEAMS).toHaveLength(6);
    const keys = TEAMS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);

    for (const t of TEAMS) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.shortName).toBe('string');
      expect(typeof t.color).toBe('string');
      expect(typeof t.lead).toBe('string');
      expect([1, 2, 3]).toContain(t.floor);
      expect(Array.isArray(t.roles)).toBe(true);
      expect(t.roles.length).toBeGreaterThan(0);
      expect(Array.isArray(t.agentIds)).toBe(true);
      expect(t.agentIds.length).toBeGreaterThan(0);
      expect(Array.isArray(t.members)).toBe(true);
      expect(t.members.length).toBeGreaterThan(0);
      expect(t.podCenter).toBeTruthy();
      expect(Number.isFinite(t.podCenter.x)).toBe(true);
      expect(Number.isFinite(t.podCenter.y)).toBe(true);
      expect(Number.isFinite(t.podCenter.z)).toBe(true);
      expect(Number.isFinite(t.podCenter.r)).toBe(true);
    }
  });

  it('semua 26 agen kantor terdistribusi unik tanpa duplikasi anggota antar tim', () => {
    const allMembers = [];
    for (const t of TEAMS) {
      allMembers.push(...t.members);
    }
    expect(allMembers).toHaveLength(26);
    expect(new Set(allMembers).size).toBe(26);
  });

  it('findTeamByRole memetakan role task dengan benar', () => {
    expect(findTeamByRole('backend')?.key).toBe('core-be');
    expect(findTeamByRole('DATABASE')?.key).toBe('core-be');
    expect(findTeamByRole('frontend')?.key).toBe('fe-design');
    expect(findTeamByRole('UI/UX')?.key).toBe('fe-design');
    expect(findTeamByRole('design')?.key).toBe('fe-design');
    expect(findTeamByRole('devops')?.key).toBe('ops-sec');
    expect(findTeamByRole('security')?.key).toBe('ops-sec');
    expect(findTeamByRole('infra')?.key).toBe('ops-sec');
    expect(findTeamByRole('qa')?.key).toBe('qa-gov');
    expect(findTeamByRole('governance')?.key).toBe('qa-gov');
    expect(findTeamByRole('pm')?.key).toBe('prod-growth');
    expect(findTeamByRole('integration')?.key).toBe('prod-growth');
    expect(findTeamByRole('ai')?.key).toBe('ai-cs');
    expect(findTeamByRole('support')?.key).toBe('ai-cs');
    expect(findTeamByRole('')).toBeNull();
    expect(findTeamByRole(null)).toBeNull();
  });

  it('findTeamByAgent memetakan ID gateway maupun nama agen', () => {
    expect(findTeamByAgent('be1')?.key).toBe('core-be');
    expect(findTeamByAgent('fe1')?.key).toBe('fe-design');
    expect(findTeamByAgent('devops1')?.key).toBe('ops-sec');
    expect(findTeamByAgent('qa1')?.key).toBe('qa-gov');
    expect(findTeamByAgent('pm1')?.key).toBe('prod-growth');
    expect(findTeamByAgent('ai-cs')?.key).toBe('ai-cs');

    expect(findTeamByAgent('BUDI')?.key).toBe('core-be');
    expect(findTeamByAgent('Dewi')?.key).toBe('fe-design');
    expect(findTeamByAgent('Toni')?.key).toBe('ops-sec');
    expect(findTeamByAgent('RINA')?.key).toBe('qa-gov');
    expect(findTeamByAgent('SARI')?.key).toBe('prod-growth');
    expect(findTeamByAgent('BANTUIN AI')?.key).toBe('ai-cs');
    expect(findTeamByAgent(null)).toBeNull();
    expect(findTeamByAgent('UNKNOWN_PERSON')).toBeNull();
  });

  it('findTeamByKey mencari tim berdasarkan key unik', () => {
    expect(findTeamByKey('core-be')?.name).toBe('Backend & Data');
    expect(findTeamByKey('fe-design')?.name).toBe('Frontend & Design');
    expect(findTeamByKey('non-existent')).toBeNull();
    expect(findTeamByKey(null)).toBeNull();
  });

  it('computeTeamStats mengagregasikan task per tim dengan akurat', () => {
    const tasks = [
      { id: 1, role: 'backend', status: 'done' },
      { id: 2, role: 'backend', status: 'done' },
      { id: 3, role: 'backend', status: 'running' },
      { id: 4, role: 'frontend', status: 'done' },
      { id: 5, role: 'frontend', status: 'failed' },
      { id: 6, role: 'devops', status: 'completed' },
      { id: 7, role: 'qa', status: 'review' },
      { id: 8, agent_id: 'pm1', status: 'done' },
      { id: 9, role: 'ai', status: 'pending' },
    ];

    const stats = computeTeamStats(tasks);
    expect(stats).toHaveLength(6);

    const be = stats.find((s) => s.key === 'core-be');
    expect(be.total).toBe(3);
    expect(be.done).toBe(2);
    expect(be.running).toBe(1);
    expect(be.pct).toBe(67); // 2/3 = 67%

    const fe = stats.find((s) => s.key === 'fe-design');
    expect(fe.total).toBe(2);
    expect(fe.done).toBe(1);
    expect(fe.failed).toBe(1);
    expect(fe.pct).toBe(50); // 1/2 = 50%

    const ops = stats.find((s) => s.key === 'ops-sec');
    expect(ops.total).toBe(1);
    expect(ops.done).toBe(1);
    expect(ops.pct).toBe(100);

    const qa = stats.find((s) => s.key === 'qa-gov');
    expect(qa.total).toBe(1);
    expect(qa.review).toBe(1);
    expect(qa.pct).toBe(0);

    const prod = stats.find((s) => s.key === 'prod-growth');
    expect(prod.total).toBe(1);
    expect(prod.done).toBe(1);
    expect(prod.pct).toBe(100);

    const ai = stats.find((s) => s.key === 'ai-cs');
    expect(ai.total).toBe(1);
    expect(ai.pending).toBe(1);
    expect(ai.pct).toBe(0);
  });

  it('computeTeamStats toleran terhadap format objek { tasks: [...] } dan input null/kosong', () => {
    const wrapped = computeTeamStats({ tasks: [{ id: 1, role: 'backend', status: 'done' }] });
    expect(wrapped.find((s) => s.key === 'core-be').total).toBe(1);

    const empty = computeTeamStats([]);
    expect(empty).toHaveLength(6);
    expect(empty.every((s) => s.total === 0 && s.pct === 0)).toBe(true);

    const nullStats = computeTeamStats(null);
    expect(nullStats).toHaveLength(6);
    expect(nullStats.every((s) => s.total === 0 && s.pct === 0)).toBe(true);
  });

  it('teamPodFocusTarget mengembalikan koordinat kamera target yang valid', () => {
    const target = teamPodFocusTarget('core-be');
    expect(target.x).toBe(-8.5);
    expect(target.y).toBe(0.60);
    expect(target.z).toBe(2.0);
    expect(target.r).toBe(16);
    expect(target.phi).toBe(1.05);

    const fallback = teamPodFocusTarget('invalid-key');
    expect(fallback.x).toBe(0);
    expect(fallback.y).toBe(1.1);
    expect(fallback.r).toBe(19);
  });
});
