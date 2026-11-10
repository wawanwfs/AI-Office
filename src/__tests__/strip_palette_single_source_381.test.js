import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js';
import { TV_BLUE, TV_RED } from '../scene/parts/tv_canvas.js';
import { stripSegments } from '../scene/parts/projectboard_data.js';

const root = join(process.cwd(), 'src');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('siklus 381 — palet strip papan & TV satu sumber', () => {
  it('salinan literal drift dihapus dari tv_canvas & projectboard_data', () => {
    const tv = read('scene/parts/tv_canvas.js');
    expect(tv).not.toContain("'#448AFF'");
    expect(tv).not.toContain('"#448AFF"');
    expect(tv).not.toContain("'#ef4444'");
    const pbd = read('scene/parts/projectboard_data.js');
    expect(pbd.split('stripSegments')[1]).not.toContain('#448AFF');
    expect(pbd.split('stripSegments')[1]).not.toContain('#ef4444');
    expect(pbd.split('stripSegments')[1]).not.toContain('#10E5A0');
    expect(pbd.split('stripSegments')[1]).not.toContain('#F59E0B');
  });

  it('TV_BLUE/TV_RED delegasi TASK_STATUS_COLORS', () => {
    expect(TV_BLUE).toBe(TASK_STATUS_COLORS.review);
    expect(TV_RED).toBe(TASK_STATUS_COLORS.failed);
    expect(TV_BLUE).toBe('#60A5FA');
    expect(TV_RED).toBe('#EF4444');
  });

  it('stripSegments memakai warna kanonik (ok/err/aksen)', () => {
    const segs = stripSegments({
      saas: { online: false },
      agents: [{ name: 'be1', status: 'Up' }, { name: 'qa1', status: 'Exited' }],
      omniroute: { online: true, port: 8787 },
    });
    const by = (t) => segs.find((s) => s.txt === t);
    expect(by('SaaS').col).toBe(TASK_STATUS_COLORS.review);
    expect(by('offline').col).toBe(TASK_STATUS_COLORS.failed);
    expect(by('AGENT').col).toBe(TASK_STATUS_COLORS.review);
    expect(by('be1 ●').col).toBe(TASK_STATUS_COLORS.done);
    expect(by('qa1 ○').col).toBe(TASK_STATUS_COLORS.failed);
    expect(by(':8787 ●').col).toBe(TASK_STATUS_COLORS.done);
  });

  it('palet kanonik tetap frozen (anti-poisoning)', () => {
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true);
  });
});
