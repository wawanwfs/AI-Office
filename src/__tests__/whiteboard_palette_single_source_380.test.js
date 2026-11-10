// Siklus 380 — whiteboard sprint live memakai palet kanonik task_status_colors.
// Sebelumnya WB_LIVE_COLORS salinan manual dengan nilai drift:
//   done #16a34a (vs kanonik #10E5A0), review #448AFF (vs #60A5FA),
//   failed #ef4444 (vs #EF4444, beda kapital saja tapi salinan terpisah).
// Baris "selesai/review/gagal" di papan tulis 3D kini sama warna dengan chip UI.
import { describe, it, expect } from 'vitest';
import { WB_LIVE_COLORS } from '../scene/parts/whiteboard_canvas.js';
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js';

describe('siklus 380: WB_LIVE_COLORS satu sumber', () => {
  it('tidak ada lagi salinan manual dengan hex lama yang drift', () => {
    const fs = require('fs');
    const src = fs.readFileSync('src/scene/parts/whiteboard_canvas.js', 'utf8');
    expect(src.includes("'#16a34a'")).toBe(false);
    expect(src.includes("'#448AFF'")).toBe(false);
    expect(src.includes("'#ef4444'")).toBe(false);
  });

  it('delegasi ke TASK_STATUS_COLORS untuk done/review/failed', () => {
    expect(WB_LIVE_COLORS.done).toBe(TASK_STATUS_COLORS.done);
    expect(WB_LIVE_COLORS.review).toBe(TASK_STATUS_COLORS.review);
    expect(WB_LIVE_COLORS.failed).toBe(TASK_STATUS_COLORS.failed);
  });

  it('palet frozen (tak bisa ditimpa diam-diam)', () => {
    expect(Object.isFrozen(WB_LIVE_COLORS)).toBe(true);
  });

  it('nilai kanonik sesuai palet siklus 373', () => {
    expect(WB_LIVE_COLORS).toEqual({
      done: '#10E5A0',
      review: '#60A5FA',
      failed: '#EF4444',
      ontrack: '#334155',
    });
  });
});
