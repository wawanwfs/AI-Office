import { describe, it, expect } from 'vitest';
import { BADGE_COLORS, badgeAssignments } from '../scene/parts/status_poll.js';
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js';

describe('siklus 389 — badge dada scene delegasi palet satu sumber', () => {
  it('tidak ada literal warna drift di status_poll.js', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      new URL('../scene/parts/status_poll.js', import.meta.url),
      'utf8'
    );
    for (const lit of ['#f66', '#59a5ff', '#f59e0b', '#8b93a3', '#10E5A0', '#EF4444', '#60A5FA']) {
      expect(src).not.toContain(lit);
    }
    expect(src).toContain("TASK_STATUS_COLORS.done");
    expect(src).toContain("TASK_STATUS_COLORS.failed");
  });

  it('BADGE_COLORS identik dengan TASK_STATUS_COLORS', () => {
    for (const k of ['done', 'running', 'failed', 'review', 'pending']) {
      expect(BADGE_COLORS[k]).toBe(TASK_STATUS_COLORS[k]);
    }
  });

  it('badgeAssignments memakai warna kanonik', () => {
    const agentData = [{ agent: { name: 'A' }, sittingChar: { userData: { badge: {} } } }];
    const agents = { 1: { last: 'failed' } };
    const im = { A: 1 };
    const out = badgeAssignments(agentData, agents, im);
    expect(out).toEqual([{ ad: agentData[0], gid: 1, status: 'failed' }]);
  });
});
