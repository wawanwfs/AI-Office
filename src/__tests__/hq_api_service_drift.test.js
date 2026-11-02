import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'

// drift-gate — siklus 207: SATU SUMBER api_service produksi wfs-hq (:9503).
//
// Latar (audit drift siklus 207, pola 206): repo punya backend/api_service.py
// (hardening 2026-10-28: _content_length toleran + MAX_API_BODY 5MB -> 413)
// TANPA fitur live DELETE; produksi ~/wfs-hq/api_service.py punya fitur
// DELETE tasks/reset TANPA hardening. Dua sumber saling meleset.
// Solusi: backend_live/wfs_api_service.py = superset ter-track; deploy hanya
// via scripts/apply_wfs_api_service.py (backup + compile-check + smoke + auto-rollback).

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'backend_live/wfs_api_service.py')
const SRC2 = resolve(REPO, 'backend_live/wfs_hq_server.py')
const SRC_TEST = resolve(REPO, 'backend_live/test_wfs_api_service.py')
const APPLY = resolve(REPO, 'scripts/apply_wfs_api_service.py')
const DST = '/home/agentuser/wfs-hq/api_service.py'
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

describe('drift-gate api_service produksi wfs-hq (siklus 207)', () => {
  it('sumber superset backend_live/wfs_api_service.py ada (single source of truth)', () => {
    expect(existsSync(SRC)).toBe(true)
  })

  it('file live produksi IDENTIK dgn sumber ter-track (drift dua arah tak boleh kembali)', () => {
    // CI-safe (siklus 210): runner GitHub tidak punya ~/wfs-hq — file live
    // absen = assertion sha di-skip DI RUNNER SAJA. Di VM produksi gate ini
    // tetap KETAT (file ada); deploy salah = vitest lokal/deploy-gate merah.
    if (!existsSync(DST)) return
    expect(sha(DST)).toBe(sha(SRC))
  })

  it('test superset ikut ter-track dan menarget modul superset', () => {
    const t = readFileSync(SRC_TEST, 'utf-8')
    expect(t).toContain('import wfs_api_service')
    expect(t).toContain('_content_length')
    expect(t).toContain('DELETE')
  })

  it('hardening 2026-10-28 HIDUP di sumber: parse toleran + cap 5MB -> 413 di jalur POST /api/*', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('_content_length')
    expect(s).toContain('MAX_API_BODY = 5 * 1024 * 1024')
    expect(s).toContain('payload terlalu besar')
    // tidak ada lagi int() telanjang pada Content-Length di api_service
    expect(s.replace(/\n#.*/g, '')).not.toMatch(/int\(handler\.headers\.get\("Content-Length"/)
    // jalur POST wajib lewat guard
    expect(s).toContain('ln = _content_length(handler.headers)')
    expect(s).toContain('if ln > MAX_API_BODY:')
  })

  it('fitur live produksi (DELETE reset + DELETE per task) utuh di sumber superset', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('api_path == "tasks" and method == "DELETE"')
    expect(s).toContain('cleared_tasks')
    expect(s).toContain('api_path.startswith("tasks/") and api_path.count("/") == 1 and method == "DELETE"')
    expect(s).toContain('"remaining"')
    // reset juga mengosongkan agents status
    expect(s).toContain("UPDATE agents SET status='idle', current_task_id=NULL")
  })

  it('import 3-tingkat: superset jalan sebagai paket, flat di backend_live, dan flat di ~/wfs-hq', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('_REPO_BACKEND')
    expect(s).toContain('from .database import')
    expect(s).toContain('from database import')
  })

  it('apply script deploy terkontrol: backup + compile-check + smoke + auto-rollback', () => {
    const a = readFileSync(APPLY, 'utf-8')
    expect(a).toContain('api_service.py.bak-')
    expect(a).toContain('py_compile')
    expect(a).toContain('def smoke(')
    expect(a).toContain('_rollback_to(bak)')
    expect(a).toContain('systemctl')
    // smoke wajib mengetes jalur hardening yang DULU mati (HTTP murni, tanpa chrome)
    expect(a).toContain('cl_header="abc"')
    expect(a).toContain('payload terlalu besar')
  })

  it('SIKLUS 218: gerbang token legacy /api/* hidup di server + smoke bawa token', () => {
    const s = readFileSync(SRC2, 'utf-8')
    // Fungsi gate + pemakaian eksak di do_POST & do_DELETE (mutasi wajib token).
    expect(s).toContain('def _api_token_ok(handler):')
    expect(s).toContain('return handler.command == "GET" or handler.headers.get("X-WFS-Token") == UI_TOKEN')
    expect(s.match(/if not _api_token_ok\(self\):/g)?.length).toBe(2)
    // Smoke apply_wfs_api_service wajib kirim token sah (kalau tidak, smoke
    // akan salah menyalahkan server padahal ditolak gerbang sendiri).
    const a = readFileSync(APPLY, 'utf-8')
    expect(a).toContain('def ui_token():')
    expect(a).toContain('post_raw("/api/__smoke207cl", cl_header="abc", token=TOK)')
    expect(a).toContain('post_raw("/api/__smoke207cap", cl_header=str(5 * 1024 * 1024 + 1), token=TOK)')
    expect(a).toContain('headers={"X-WFS-Token": TOK} if TOK else {}')
  })

  it('SOP anti-drift terdokumentasi di sumber (JANGAN edit live langsung)', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('JANGAN mengedit ~/wfs-hq/api_service.py langsung')
    expect(s).toContain('drift gate vitest akan FAIL')
  })
})
