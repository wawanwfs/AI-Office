import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'

// drift-gate — siklus 209: SATU SUMBER server.py produksi gateway :8787
// (wfs-office), pola 206 (hq server) / 207 (api_service) / 208 (tasks+orders).
//
// Latar (audit drift siklus 209 — drift ekstrem dua arah, terbesar):
// - backend/server.py (repo, 972 baris) = generasi hardened TAPI tanpa fitur
//   live (env WFS_AI_* default openai, tanpa routers live, root static).
// - ~/wfs-office/server.py (produksi, 484 baris) = fitur-rich live TAPI pause
//   in-memory hilang saat restart + tanpa approval-gate/pause-persisten.
// - Solusi: backend_live/wfs_server.py = SUPERSET (fitur live eksak +
//   hardening hidup + mode ganda guarded database.py); backend/server.py
//   dihapus; deploy hanya via scripts/apply_wfs_server.py --apply.

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const SRC = resolve(REPO, 'backend_live/wfs_server.py')
const APPLY = resolve(REPO, 'scripts/apply_wfs_server.py')
const DST = '/home/agentuser/wfs-office/server.py'
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const src = () => readFileSync(SRC, 'utf-8')

describe('drift-gate server gateway produksi :8787 (siklus 209)', () => {
  it('sumber superset backend_live/wfs_server.py ada (single source of truth)', () => {
    expect(src()).toBeTruthy()
  })

  it('server.py live produksi IDENTIK dgn sumber ter-track (drift dua arah tak boleh kembali)', () => {
    // CI-safe (siklus 210): runner GitHub tidak punya ~/wfs-office — file live
    // absen = assertion sha di-skip DI RUNNER SAJA. Di VM produksi gate ini
    // tetap KETAT (file ada); kesalahan deploy = vitest lokal/deploy-gate merah.
    if (!existsSync(DST)) return
    expect(sha(DST)).toBe(sha(SRC))
  })

  it('backend/server.py duplikat mati TIDAK kembali (pola 206/207/208)', () => {
    let exists = true
    try { readFileSync(resolve(REPO, 'backend/server.py')) } catch { exists = false }
    expect(exists).toBe(false)
  })

  it('deploy script apply_wfs_server.py ada dgn smoke 2 fase + rollback', () => {
    const s = readFileSync(APPLY, 'utf-8')
    expect(s).toContain('--apply')
    expect(s).toContain('strict=True')
    expect(s.toLowerCase()).toContain('auto-rollback')
    expect(s).toContain('systemctl', 'restart wfs-office')
  })

  it('FIX #2 pause persisten hidup: endpoint membaca engine (DB engine_state), _PAUSED in-memory TIDAK kembali', () => {
    const s = src()
    expect(s).toContain('return {"paused": taskengine.is_paused()}')
    expect(s).not.toContain('_PAUSED = {')
    expect(s).not.toContain('_PAUSED["on"]')
    // run & run_all guard pause SEBELUM jadwal.
    expect(s).toMatch(/async def api_run_task\(tid: int\):\s*\n\s*if taskengine\.is_paused\(\):/)
    expect(s).toMatch(/async def api_run_all\(body: dict\):\s*\n\s*if taskengine\.is_paused\(\):/)
    // pause_all & resume_all lewat engine persisten.
    expect(s).toContain('taskengine.set_paused(True)')
    expect(s).toMatch(/was_paused = taskengine\.is_paused\(\)/)
    expect(s).toMatch(/taskengine\.set_paused\(was_paused\)/)
  })

  it('approval-gate + claim fcntl + recovery hidup di semua pintu eksekusi', () => {
    const s = src()
    expect(s).toContain('taskengine.require_launch_approval')
    expect(s).toContain('taskengine.claim_task(tid)')
    expect(s).toContain('taskengine.release_task(tid, claim)')
    expect(s).toMatch(/async def lifespan\(app\):\s*\n\s*taskengine\.recover_interrupted\(\)/)
    // _schedule: rollback reservasi saat konflik.
    expect(s).toMatch(/except Exception as exc:\s*\n\s*for tid, claim in claims\.items\(\):/)
  })

  it('fitur live eksak TIDAK hilang: default engine, ai-cs Bantuin AI, redirect :9503, routers live', () => {
    const s = src()
    expect(s).toContain('taskengine.load_default()')
    expect(s).not.toContain('https://api.openai.com/v1')
    expect(s).toContain('"Bantuin AI"')
    expect(s).toContain('dibantuin.com')
    expect(s).toContain('RedirectResponse("http://100.117.198.46:9503/")')
    expect(s).toContain('wfs_events')
    expect(s).toContain('wfs_sh_console')
    expect(s).toContain('wfs_dashboard_stats')
    expect(s).toContain('from orders import router as orders_router')
  })

  it('mode ganda guarded database.py: startup tidak menabrak saat DB absen/rusak', () => {
    const s = src()
    expect(s).toContain('except Exception:\n        return None')
    expect(s).toContain('SH_DB.init_db()')
    expect(s).toContain('if SH_DB is None:')
  })

  it('hardening repo hidup: parser /proc toleran + config key tak bocor + sandbox clamp', () => {
    const s = src()
    expect(s).toContain('def _parse_meminfo(text)')
    expect(s).toContain('def _parse_uptime_s(text)')
    expect(s).toContain('def _parse_loadavg(text)')
    expect(s).toContain('def _clamp_int(v, default, lo=None, hi=None)')
    expect(s).toContain('_clamp_int(body.get("timeout"), 60, 1, 600)')
    expect(s).not.toMatch(/int\(body\.get\("timeout"\)\)/)
  })

  it('siklus 217: introspeksi API DITUTUP — docs/redoc/openapi None di app + smoke fase-2 menegakkan 404', () => {
    const s = src()
    // FastAPI tidak mendaftarkan rute introspeksi sama sekali (bukan 404 dinamis).
    expect(s).toContain('docs_url=None')
    expect(s).toContain('redoc_url=None')
    expect(s).toContain('openapi_url=None')
    // smoke fase-2 apply script wajib verifikasi 404 ketiganya via HTTP.
    const a = readFileSync(APPLY, 'utf-8')
    expect(a).toContain('"/docs", "/redoc", "/openapi.json"')
    expect(a).toContain('introspeksi API ditutup 217')
  })

  it('test superset ter-track dan menarget wfs_server', () => {
    const t = readFileSync(resolve(REPO, 'backend_live/test_wfs_server_superset.py'), 'utf-8')
    expect(t).toContain('import wfs_server as server')
    expect(t).toContain('import wfs_tasks as taskengine')
  })

  it('siklus 227: HEAD mirror replay terpasang di superset (pola 226 :8000) — SSE dikecualikan', () => {
    const s = src()
    // Replay eksak: scope method GET + app asli + receive terpisah (anti-deadlock
    // terukur siklus 226 — receive asli TIDAK di-drain, transport mem-block).
    expect(s).toContain('get_scope["method"] = "GET"')
    expect(s).toContain('await self.app(get_scope, replay_receive, capture)')
    expect(s).toContain('receive asli TIDAK di-drain')
    expect(s).toContain('app.add_middleware(HeadMirrorMiddleware)')
    // CL dari panjang body GET replay; body HEAD kosong.
    expect(s).toContain('b"content-length"')
    expect(s).toContain('"body": b""')
    // SSE /api/events dikecualikan eksplisit SEBELUM cek replay (GET streaming).
    expect(s).toContain('scope.get("path", "").split("?")[0] == "/api/events"')
    // Rute tanpa GET tidak di-mirror (405/404 asli).
    expect(s).toContain('_has_get_route')
    expect(s).toContain('_has_native_head_route')
    // Pola drain dilarang (kelas deadlock 226).
    expect(s).not.toMatch(/while True:\s*\n\s*msg = await receive\(\)/)
    // Guard pytest perilaku nyata ada di test superset.
    const t = readFileSync(resolve(REPO, 'backend_live/test_wfs_server_superset.py'), 'utf-8')
    expect(t).toContain('def test_head_mirror_replays_get_routes')
    expect(t).toContain('def test_head_mirror_sse_excluded_and_replay_contract_in_source')
  })

  it('siklus 229: planning LLM background dipegang kuat (anti-GC) + pausable — tidak ada create_task telanjang', () => {
    const s = src()
    // Referensi kuat di _bg_tasks + done-callback discard (pola eksak _schedule):
    // loop asyncio hanya menyimpan weak-ref — task planning berdurasi puluhan
    // detik bisa di-GC diam-diam -> project STUCK 'planning'.
    expect(s).toContain('_bg_tasks.add(plan_t)')
    expect(s).toContain('plan_t.add_done_callback')
    expect(s).toContain('_bg_tasks.discard(plan_t)')
    // Anti-pola: pemanggilan create_task tanpa penugasan dilarang keras.
    expect(s).not.toMatch(/^\s+asyncio\.create_task\(/m)
    // Guard pause SEBELUM LLM berbayar + project kembali 'pending' (bisa resume),
    // bukan menggantung 'planning' tanpa task saat pause_all mengcancel.
    expect(s).toContain('if taskengine.is_paused():')
    expect(s).toContain("UPDATE projects SET status='pending' WHERE id=?")
    expect(s).toContain('except asyncio.CancelledError:')
    // Guard pytest perilaku nyata (pause + GC kontrak) ter-track.
    const t = readFileSync(resolve(REPO, 'backend_live/test_wfs_server_superset.py'), 'utf-8')
    expect(t).toContain('def test_plan_project_tasks_holds_strong_ref_and_pausable')
    expect(t).toContain('def test_plan_project_tasks_pause_and_gc_contract_behavior')
  })

  it('siklus 234: /api/tasks query & POST mendukung project slug teks & numerik (anti-422)', () => {
    const s = src()
    expect(s).toContain('async def api_tasks(project: Optional[str] = None):')
    expect(s).toContain('project: Optional[Union[int, str]] = None')
    // Guard pytest perilaku nyata ter-track
    const t = readFileSync(resolve(REPO, 'backend_live/test_wfs_server_superset.py'), 'utf-8')
    expect(t).toContain('def test_api_tasks_supports_string_slug_and_numeric_project')
  })

  it('siklus 235: PATCH /api/tasks/{tid}/status persist pindah kolom kanban (engine.move_task)', () => {
    const s = src()
    // Endpoint gateway ada & delegasi engine (bukan logika SQL sendiri)
    expect(s).toContain('@app.patch("/api/tasks/{tid}/status")')
    expect(s).toContain('taskengine.move_task(tid, body.status)')
    // Guard pytest perilaku nyata ter-track
    const t = readFileSync(resolve(REPO, 'backend_live/test_wfs_server_superset.py'), 'utf-8')
    expect(t).toContain('def test_api_tasks_move_status_persists')
  })

  it('siklus 236: GET /api/tasks/{tid} detail lengkap — brief & output agen terbaca UI', () => {
    const s = src()
    // Endpoint detail ada, delegasi engine satu sumber, read-only murni
    expect(s).toContain('@app.get("/api/tasks/{tid}")')
    expect(s).toContain('taskengine.get_task(tid)')
    const body = s.slice(s.indexOf('async def api_task_detail'), s.indexOf('@app.get("/api/system/resources")'))
    expect(body).not.toContain('require_launch_approval') // jalur baca tanpa gate
    expect(body).not.toContain('_schedule') // nol jalur eksekusi berbayar
    // Guard pytest perilaku nyata ter-track
    const t = readFileSync(resolve(REPO, 'backend_live/test_wfs_server_superset.py'), 'utf-8')
    expect(t).toContain('def test_api_task_detail_serves_prompt_and_result')
    // Engine kontrak: get_task memuat prompt+result (satu sumber detail)
    const g = readFileSync(resolve(REPO, 'backend_live/wfs_tasks.py'), 'utf-8')
    expect(g).toContain('SELECT id,project,title,role,agent_id,status,prompt,result,files,review,created,updated FROM tasks')
  })
})
