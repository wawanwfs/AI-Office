import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'

// drift-gate — siklus 208: SATU SUMBER tasks.py + orders.py engine produksi
// gateway :8787 (wfs-office), pola 206 (server) & 207 (api_service).
//
// Latar (audit drift siklus 208):
// - backend/tasks.py (repo) punya hardening eksekusi (require_launch_approval,
//   is_paused/set_paused persisten di DB engine_state, claim_task fcntl,
//   recover_interrupted, _execution_llm guard paused/approval per-call) TAPI
//   TANPA fitur live: load_default memakai env WFS_AI_* default openai.
// - ~/wfs-office/tasks.py (produksi :8787) memakai ~/.hermes/.env TANPA semua
//   hardening itu — plus BUG PRODUKSI: jalur retry QA-revise memanggil
//   asyncio.sleep tanpa import asyncio dalam scope (NameError), dan pause
//   engine in-memory (_PAUSED di server.py) hilang saat restart.
// - Solusi: backend_live/wfs_tasks.py = SUPERSET (fitur live eksak + hardening
//   hidup + fallback ~/wfs-hq/database.py utk approval gate di gateway yang
//   tidak memuat database.py); backend_live/wfs_orders.py = salinan orders
//   (identik dua sisi); deploy hanya via scripts/apply_wfs_tasks.py.

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'backend_live/wfs_tasks.py')
const SRC_ORDERS = resolve(REPO, 'backend_live/wfs_orders.py')
const SRC_TEST = resolve(REPO, 'backend_live/test_wfs_tasks_orders.py')
const SRC_GUARDS = resolve(REPO, 'backend_live/test_wfs_execution_guards.py')
const APPLY = resolve(REPO, 'scripts/apply_wfs_tasks.py')
const DST = '/home/agentuser/wfs-office/tasks.py'
const DST_ORDERS = '/home/agentuser/wfs-office/orders.py'
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

describe('drift-gate tasks engine produksi gateway :8787 (siklus 208)', () => {
  it('sumber superset backend_live/wfs_tasks.py + wfs_orders.py ada (single source of truth)', () => {
    expect(readFileSync(SRC, 'utf-8')).toBeTruthy()
    expect(readFileSync(SRC_ORDERS, 'utf-8')).toBeTruthy()
  })

  it('tasks.py live produksi IDENTIK dgn sumber ter-track (drift dua arah tak boleh kembali)', () => {
    // CI-safe (siklus 210): runner tanpa ~/wfs-office → skip hanya assertion sha
    // live; gate tetap KETAT di VM produksi (deploy salah = vitest lokal merah).
    if (!existsSync(DST)) return
    expect(sha(DST)).toBe(sha(SRC))
  })

  it('orders.py live produksi IDENTIK dgn sumber ter-track', () => {
    if (!existsSync(DST_ORDERS)) return // pola sama dgn atas
    expect(sha(DST_ORDERS)).toBe(sha(SRC_ORDERS))
  })

  it('deploy script apply_wfs_tasks.py ada dgn smoke 2 fase + rollback', () => {
    const s = readFileSync(APPLY, 'utf-8')
    expect(s).toContain('--apply')
    expect(s).toContain('strict=True')
    expect(s.toLowerCase()).toContain('auto-rollback')
    expect(s).toContain('systemctl', 'restart wfs-office')
  })

  it('test superset ter-track dan menarget modul superset', () => {
    const t = readFileSync(SRC_TEST, 'utf-8')
    expect(t).toContain('import wfs_tasks as tasks')
    expect(t).toContain('import wfs_orders as orders')
    const g = readFileSync(SRC_GUARDS, 'utf-8')
    expect(g).toContain('import wfs_tasks as tasks')
  })

  it('hardening eksekusi HIDUP di sumber superset: approval gate + pause persisten + claim + recovery', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain("def require_launch_approval(project)")
    expect(s).toContain("'project_launch approval required'")
    expect(s).toContain("def is_paused()")
    expect(s).toContain('engine_state')
    expect(s).toContain("def set_paused(paused)")
    expect(s).toContain("def claim_task(tid)")
    expect(s).toContain('fcntl.flock')
    expect(s).toContain("def recover_interrupted()")
    expect(s).toContain('already running')
  })

  it('_execution_llm guard paused/approval per-call (hardening 186) hidup', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('async def _execution_llm(tid, *args)')
    // guard sebelum & sesudah call_llm + approval
    const body = s.slice(s.indexOf('async def _execution_llm'), s.indexOf('async def _execute_task'))
    expect((body.match(/is_paused\(\)/g) || []).length).toBeGreaterThanOrEqual(2)
    expect((body.match(/require_launch_approval/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('BUG PRODUKSI 208 TIDAK kembali: jalur retry QA-revise TANPA asyncio.sleep telanjang', () => {
    const s = readFileSync(SRC, 'utf-8')
    // _execute_task harus import asyncio dalam scope (run_task juga)
    expect(s).toMatch(/async def _execute_task\(tid, attempt_no=0\):\s*\n\s*import asyncio/)
    expect(s).toMatch(/async def run_task\(tid, attempt_no=0\):\s*\n\s*import asyncio/)
    // tidak ada pemanggilan asyncio.sleep sebelum import asyncio dalam fungsi
    const body = s.slice(s.indexOf('async def _execute_task'), s.indexOf('def sync_sandbox'))
    const importIdx = body.indexOf('import asyncio')
    const sleepIdx = body.indexOf('asyncio.sleep')
    expect(importIdx).toBeGreaterThanOrEqual(0)
    expect(sleepIdx).toBeGreaterThan(importIdx)
  })

  it('fitur live eksak TIDAK hilang: load_default membaca ~/.hermes/.env (bukan openai default)', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('~/.hermes/.env')
    expect(s).toContain('CUSTOM_BASE_URL')
    expect(s).toContain('https://token.lightvela.ai/v1')
    expect(s).toContain('"model": os.environ.get("WFS_AI_MODEL") or "auto"')
    expect(s).not.toContain('https://api.openai.com/v1')
  })

  it('approval gate fallback ~/wfs-hq/database.py (gateway tanpa database.py tetap FAIL LOUD, bukan lolos)', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('~/wfs-hq/database.py')
    expect(s).toContain("spec_from_file_location")
    expect(s).toContain("database.py tidak ditemukan")
  })

  it('kontrak inti engine tetap utuh: ROLE_AGENT 14 role, ROLE_SYS, multi-call plan, sync_sandbox', () => {
    const s = readFileSync(SRC, 'utf-8')
    expect(s).toContain('"pm": "pm1", "backend": "be1", "backend2": "be2", "frontend": "fe1"')
    expect(s).toContain('Kamu Budi, Backend Engineer')
    expect(s).toContain('Kamu engineer. Dari brief berikut, balas HANYA JSON')
    expect(s).toContain('def sync_sandbox(agent_id: str, files: list)')
    expect(s).toContain('~/wfs-office/saas-dibantuin')
  })

  it('siklus 232: normalize_role — role mentah dari LLM/API dinormalisasi, fallback senyap pm1 DIHAPUS', () => {
    const s = readFileSync(SRC, 'utf-8')
    // Fungsi normalisasi ada + dipanggil di add_task SEBELUM insert DB.
    expect(s).toContain('def normalize_role(role)')
    expect(s).toMatch(/def add_task\(project, title, role, prompt\):\s*\n\s*role = normalize_role\(role\)/)
    // Fallback diam-diam lama DIHAPUS (dulu: .get(role, "pm1") — task teknis
    // dieksekusi PM).
    expect(s).not.toContain('ROLE_AGENT.get(role, "pm1")')
    // Fallback .get() tersisa harus be1 (tapi normalize membuatnya tak tersentuh).
    expect(s).toContain('ROLE_AGENT.get(role, "be1")')
    // Prompt PM membatasi daftar role (pencegahan di sumber).
    expect(s).toContain('role HANYA salah satu dari: backend, backend2, frontend')
    // Guard pytest perilaku nyata ter-track.
    const t = readFileSync(resolve(REPO, 'backend_live/test_wfs_tasks_orders.py'), 'utf-8')
    expect(t).toContain('def test_add_task_normalizes_unknown_role_to_backend')
    expect(t).toContain('def test_add_task_normalizes_llm_role_family_to_canonical')
  })

  it('siklus 233: parse_qa_verdict — format prompt VERDICT: pass/revise dikenali, anti-pola regex JSON di _execute_task dihapus', () => {
    const s = readFileSync(SRC, 'utf-8')
    // Fungsi parse_qa_verdict ada di sumber
    expect(s).toContain('def parse_qa_verdict(review)')
    // _execute_task memanggil parse_qa_verdict
    expect(s).toMatch(/verdict = parse_qa_verdict\(review\)/)
    // Anti-pola lama (regex JSON yang menolak teks prompt) tidak boleh ada di _execute_task
    const execBody = s.slice(s.indexOf('async def _execute_task'), s.indexOf('def sync_sandbox'))
    expect(execBody).not.toMatch(/vm = _re\.search\(r'"verdict"'/)
    // Guard pytest perilaku nyata ter-track
    const t = readFileSync(resolve(REPO, 'backend_live/test_wfs_tasks_orders.py'), 'utf-8')
    expect(t).toContain('def test_parse_qa_verdict_prompt_format')
    expect(t).toContain('def test_parse_qa_verdict_json_and_edge_cases')
    expect(t).toContain('def test_parse_qa_verdict_closes_prompt_regex_discrepancy')
  })

  it('siklus 234: list_tasks & get_task mendukung project slug teks + review & timestamp lengkap', () => {
    const s = readFileSync(SRC, 'utf-8')
    // get_task memilih review, created, updated
    expect(s).toMatch(/SELECT id,project,title,role,agent_id,status,prompt,result,files,review,created,updated FROM tasks WHERE id=\?/)
    // list_tasks memilih review, created, updated
    expect(s).toContain('SELECT id,project,title,role,agent_id,status,files,review,created,updated FROM tasks')
    // normalisasi filter project slug teks
    expect(s).toContain('proj = str(project).strip() if (project is not None and str(project).strip() != "") else None')
    // Guard pytest perilaku nyata ter-track
    const t = readFileSync(resolve(REPO, 'backend_live/test_wfs_tasks_orders.py'), 'utf-8')
    expect(t).toContain('def test_list_tasks_and_add_task_string_slug_and_timestamps')
  })

  it('backend/tasks.py duplikat mati TIDAK kembali (satu sumber, pola 207)', () => {
    let exists = true
    try { readFileSync(resolve(REPO, 'backend/tasks.py')) } catch { exists = false }
    expect(exists).toBe(false)
    let ordersExists = true
    try { readFileSync(resolve(REPO, 'backend/orders.py')) } catch { ordersExists = false }
    expect(ordersExists).toBe(false)
  })
})
