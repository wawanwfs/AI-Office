// Siklus 370: identitas agen satu sumber — agent_identity.js
// Tiga salinan pemetaan id↔nama dihapus (running_tasks 26 entri,
// OfficeScene focusAgent 15 entri, App.jsx __wfsSceneSelect 15 entri).
// Salinan 15-entri tidak punya 12 spesialis extended → fokus/pilih agen
// spesialis via id gagal diam-diam.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  AGENT_ID_SCENE_PAIRS,
  SCENE_NAME_TO_ID,
  SCENE_ID_TO_NAME,
} from '../scene/parts/agent_identity.js';
import { resolveAgentId } from '../scene/parts/running_tasks.js';

const os = readFileSync(new URL('../scene/OfficeScene.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const rt = readFileSync(new URL('../scene/parts/running_tasks.js', import.meta.url), 'utf8');

describe('agent_identity satu sumber (siklus 370)', () => {
  it('tiga salinan tabel manual hilang dari kode pemakai', () => {
    expect(os).not.toContain("'be1': 'BUDI'");
    expect(app).not.toContain("'be1': 'BUDI'");
    expect(rt).not.toContain("'BUDI': 'be1'");
    expect(os).toContain('SCENE_ID_TO_NAME');
    expect(app).toContain('SCENE_ID_TO_NAME');
    expect(rt).toMatch(/from '\.\/agent_identity\.js'/);
  });

  it('27 pasangan id↔nama, dua arah konsisten', () => {
    expect(AGENT_ID_SCENE_PAIRS.length).toBe(27);
    for (const [id, name] of AGENT_ID_SCENE_PAIRS) {
      expect(SCENE_ID_TO_NAME[id]).toBe(name);
      expect(SCENE_NAME_TO_ID[name.toUpperCase()]).toBe(id);
    }
    expect(Object.keys(SCENE_ID_TO_NAME).length).toBe(27);
  });

  it('paritas gateway nyata (/wfs-api/agents) — pasangan yang dulu salah urutan', () => {
    // Pasangan yang dulu salah di tabel running_tasks lama (drift urutan):
    expect(resolveAgentId('BUDI', null)).toBe('be1');
    expect(resolveAgentId('RIZKY', null)).toBe('be2');
    expect(resolveAgentId('FERRY', null)).toBe('db1');
    expect(resolveAgentId('GILANG', null)).toBe('be-lead');
    expect(resolveAgentId('NINA', null)).toBe('rel1');
    expect(resolveAgentId('CITRA', null)).toBe('gov1');
  });

  it('12 spesialis extended kini ter-map (dulu hilang di salinan 15-entri)', () => {
    for (const id of ['arch1', 'ux2', 'prod1', 'dsgn1', 'db1', 'be-lead', 'infra1', 'sre1', 'sec1', 'secops1', 'rel1', 'gov1']) {
      expect(SCENE_ID_TO_NAME[id], id).toBeTruthy();
    }
    expect(SCENE_ID_TO_NAME['sre1']).toBe('DONI');
    expect(SCENE_ID_TO_NAME['gov1']).toBe('CITRA');
  });

  it('founder alias tetap ada di kedua arah', () => {
    expect(SCENE_NAME_TO_ID['WAHYU FS']).toBe('ceo');
    expect(SCENE_NAME_TO_ID['CEO']).toBe('ceo');
    expect(SCENE_NAME_TO_ID['WAHYU FAJAR S.']).toBe('ceo');
    expect(SCENE_ID_TO_NAME['ceo']).toBe('WAHYU FS');
  });

  it('tidak ada id/nama duplikat di pasangan sumber', () => {
    const ids = AGENT_ID_SCENE_PAIRS.map(([i]) => i);
    const names = AGENT_ID_SCENE_PAIRS.map(([, n]) => n.toUpperCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });
});
