// Unit test profil kompetensi & domain teknis 26 agen kampus + Founder (src/scene/parts/agent_competencies.js)
import { describe, it, expect } from 'vitest';
import { AGENT_COMPETENCIES, getAgentCompetency } from '../scene/parts/agent_competencies.js';

describe('agent_competencies — data kompetensi & spesialisasi', () => {
  it('mencakup 27 entri lengkap (26 spesialis AI multi-lantai + Founder Wahyu FS)', () => {
    const keys = Object.keys(AGENT_COMPETENCIES);
    expect(keys.length).toBe(27);
  });

  it('setiap entri memiliki domain, summary deskriptif, dan minimal 2 tags teknis', () => {
    for (const [name, prof] of Object.entries(AGENT_COMPETENCIES)) {
      expect(typeof prof.domain, `${name} domain`).toBe('string');
      expect(prof.domain.trim().length, `${name} domain length`).toBeGreaterThan(5);

      expect(typeof prof.summary, `${name} summary`).toBe('string');
      expect(prof.summary.trim().length, `${name} summary length`).toBeGreaterThan(15);

      expect(Array.isArray(prof.tags), `${name} tags`).toBe(true);
      expect(prof.tags.length, `${name} tags count`).toBeGreaterThanOrEqual(2);
      prof.tags.forEach((t) => expect(typeof t).toBe('string'));
    }
  });

  it('Wahyu FS ditandai isFounder: true dengan domain arsitektur eksekutif', () => {
    const founder = AGENT_COMPETENCIES['WAHYU FS'];
    expect(founder.isFounder).toBe(true);
    expect(founder.domain).toContain('Architecture');
  });
});

describe('agent_competencies — getAgentCompetency helper', () => {
  it('resolusi berbasis string nama agen kapital dan lowercase', () => {
    const cBudi = getAgentCompetency('BUDI');
    expect(cBudi.domain).toBe('Core Backend & API Services');
    expect(cBudi.tags).toContain('FastAPI / Express');

    const cDewi = getAgentCompetency('dewi');
    expect(cDewi.domain).toBe('Modern Frontend & Component Architecture');
  });

  it('resolusi objek agent { name, role }', () => {
    const cAris = getAgentCompetency({ name: 'ARIS', role: 'Solution Architect' });
    expect(cAris.domain).toBe('Distributed Architecture & Microservices');
    expect(cAris.tags).toContain('Kafka');

    const cSec = getAgentCompetency({ name: 'SECBOT', role: 'Security Engineer' });
    expect(cSec.domain).toBe('Cybersecurity & Perimeter Defense');
    expect(cSec.tags).toContain('AES-256');
  });

  it('resolusi alias Founder Wahyu FS (WAHYU, WAHYU FAJAR S., CEO)', () => {
    ['Wahyu', 'Wahyu FS', 'Wahyu Fajar S.', 'CEO', 'WAHYU FAJAR SETIAWAN'].forEach((alias) => {
      const c = getAgentCompetency(alias);
      expect(c.isFounder).toBe(true);
      expect(c.domain).toBe('Executive Architecture & Vision');
    });
  });

  it('fallback elegan untuk nama atau role tidak dikenal / null', () => {
    const fallbackNull = getAgentCompetency(null);
    expect(fallbackNull.domain).toBe('Autonomous Specialist');
    expect(fallbackNull.tags).toContain('WFS Project');

    const customRole = getAgentCompetency({ name: 'UNKNOWN_BOT', role: 'Quantum Physicist' });
    expect(customRole.domain).toBe('Quantum Physicist');
    expect(customRole.tags).toContain('Quantum Physicist');
  });

  it('objek tanpa name (hanya role) jatuh ke fallback role, bukan profil Founder', () => {
    const anonymous = getAgentCompetency({ role: 'Data Engineer' });
    expect(anonymous.domain).toBe('Data Engineer');
    expect(anonymous.tags).toContain('AI Specialist');
    expect(anonymous.isFounder).not.toBe(true);
  });

  it('string kosong / spasi tidak pernah jatuh ke profil Founder', () => {
    expect(getAgentCompetency('').domain).toBe('Autonomous Specialist'); // nullish guard
    const ws = getAgentCompetency('   ');
    expect(ws.domain).toBe('Specialist');
    expect(ws.isFounder).not.toBe(true);
  });
});
