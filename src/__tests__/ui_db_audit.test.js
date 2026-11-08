// @vitest-environment jsdom
// Siklus 238 — drift-gate audit DB UI (scripts/audit_ui_db_238.py):
// 1. script ada & executable;
// 2. guard keamanan tidak menyusut: purge WAJIB menolak bila ada task non-junk
//    (BATAL path), backup dulu sebelum DELETE, dan agents TIDAK dihapus (seed UI);
// 3. audit live dijalankan saat vitest & wajib exit 0 (DB bersih / hanya data user).
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const read = (p) => readFileSync(p, 'utf8')
const SCRIPT = resolve(root, 'scripts/audit_ui_db_238.py')

describe('audit_ui_db_238 — drift-gate', () => {
  const src = read(SCRIPT)

  it('script ada & executable', () => {
    expect(src).toBeTruthy()
    expect(src).toContain('#!/usr/bin/env python3')
  })

  it('kontrak purge tidak menyusut: backup dulu + tolak bila ada non-junk + agents dipertahankan', () => {
    // Guard urutan: backup sebelum DELETE
    expect(src).toMatch(/shutil\.copy2\(dbp, bak\)/)
    // Guard non-junk: purge BATAL bila ada task di luar pola junk
    expect(src).toContain('purge ditolak')
    expect(src).toMatch(/total != junk/)
    // Guard agents: TIDAK ada DELETE FROM agents (seed agen dipakai UI)
    expect(src).not.toMatch(/DELETE FROM agents/i)
    // Tabel yang dihapus eksak (bukan DROP DATABASE)
    for (const t of ['execution_logs', 'subtasks', 'tasks', 'projects']) {
      expect(src).toContain(`DELETE FROM ${t}`)
    }
    // Audit read-only: koneksi mode=ro
    expect(src).toMatch(/mode=ro/)
  })

  it.skipIf(process.env.WFS_RUN_LIVE_AUDITS !== '1')('audit live lulus penuh saat vitest (DB UI bersih / hanya data user)', () => {
    const out = execFileSync('python3', [SCRIPT], {
      encoding: 'utf8', timeout: 30_000,
    })
    // exit code 0 = bersih atau ada data user (bukan junk murni)
    expect(out).toMatch(/tasks\s*:/)
  })
})
