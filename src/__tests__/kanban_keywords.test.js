import { describe, it, expect } from 'vitest';
import {
  INDONESIAN_STATUS_KEYWORDS,
  KANBAN_COLUMNS,
  matchTaskSearch,
} from '../scene/parts/kanban_spec';

// Kontrak data INDONESIAN_STATUS_KEYWORDS: sinonim bahasa Indonesia per status
// yang dipakai matchTaskSearch() untuk pencarian kolom kanban. Test ini
// mengunci integritas data agar perbaikan/penambahan kata kunci tidak
// menghancurkan prediktabilitas pencarian (cross-collision = hasil kabur).

const STATUS_KEYS = [...KANBAN_COLUMNS.map((c) => c.key), 'failed'];

const cleanTask = (status) => ({ id: 1000, title: 'Task murni', status });

const tokensOf = (s) => s.trim().split(/\s+/).filter(Boolean);

describe('kanban_spec — INDONESIAN_STATUS_KEYWORDS', () => {
  it('mendefinisikan daftar kata kunci non-kosong untuk setiap kolom kanban + failed', () => {
    for (const key of STATUS_KEYS) {
      expect(typeof INDONESIAN_STATUS_KEYWORDS[key], `status "${key}"`).toBe('string');
      expect(tokensOf(INDONESIAN_STATUS_KEYWORDS[key]).length, `status "${key}"`).toBeGreaterThan(0);
    }
  });

  it('setiap daftar kata kunci bebas duplikat', () => {
    for (const [key, words] of Object.entries(INDONESIAN_STATUS_KEYWORDS)) {
      const tokens = tokensOf(words);
      expect(new Set(tokens).size, `duplikat di "${key}"`).toBe(tokens.length);
    }
  });

  it('tidak ada kata kunci yang bertabrakan antar status (satu istilah → satu status)', () => {
    const seen = new Map();
    for (const [status, words] of Object.entries(INDONESIAN_STATUS_KEYWORDS)) {
      for (const w of tokensOf(words)) {
        expect(seen.has(w), `kata kunci "${w}" dipakai ${status} & ${seen.get(w)}`).toBe(false);
        seen.set(w, status);
      }
    }
  });

  it('setiap kata kunci benar-benar mencocokkan task pada statusnya', () => {
    for (const [status, words] of Object.entries(INDONESIAN_STATUS_KEYWORDS)) {
      const task = cleanTask(status);
      for (const w of tokensOf(words)) {
        expect(matchTaskSearch(task, w), `"${w}" harus cocok status ${status}`).toBe(true);
      }
    }
  });

  it('kata kunci dari status lain tidak mencocokkan task bersih pada status tersebut', () => {
    for (const [sX, words] of Object.entries(INDONESIAN_STATUS_KEYWORDS)) {
      for (const sY of Object.keys(INDONESIAN_STATUS_KEYWORDS)) {
        if (sX === sY) continue;
        const task = cleanTask(sY);
        for (const w of tokensOf(words)) {
          expect(matchTaskSearch(task, w), `"${w}" (${sX}) harus TIDAK cocok ${sY}`).toBe(false);
        }
      }
    }
  });
});
