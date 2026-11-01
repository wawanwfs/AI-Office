import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'

// drift-gate — siklus 210: SISA PERMUKAAN PRODUKSI yang belum digate sha256
// (pola 206-209: produksi WAJIB identik dgn satu sumber ter-track).
//
// Latar (audit siklus 210): setelah 206 (hq server), 207 (api_service),
// 208 (tasks+orders), 209 (gateway server), masih ada 9 pasang file produksi
// tanpa gate — semuanya TERVERIFIKASI sha-identik saat audit, jadi sekarang
// saatnya DIKUNCI sebelum drift keempat terjadi:
//  - ~/wfs-hq/database.py — SUMBER APPROVAL-GATE gateway :8787 (wfs_tasks
//    memuatnya via importlib saat database tak importable; PermissionError
//    LOUD bila absen). Drift di sini = gerbang mesin berbayar.
//  - backend_live/wfs_{events,sh_console,dashboard_stats}.py — 3 router live
//    read-only gateway :8787 (SSE events, sh overview/approvals/files/logs/
//    git, dashboard stats; sumber tasks.db URI mode=ro).
//  - backend/sandbox_exec.py ↔ ~/wfs-office/ — dipanggil jalur eksekusi live
//    (wfs_tasks.run QA-revise + wfs_server endpoints).
//  - backend/{docker_sandbox,orchestrator,project_api,static_serve}.py ↔
//    ~/wfs-hq/ — core wfs-hq (:9503); di wfs-office import-nya guarded
//    (mode LIVE fallback tanpa file itu, by-design 209).
//
// CI-safe: runner GitHub tidak punya ~/wfs-hq|~/wfs-office — file live absen
// = assertion sha di-skip DI RUNNER SAJA; di VM produksi gate tetap KETAT.

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

const PAIRS = [
  {
    name: 'database.py (sumber approval-gate gateway :8787)',
    src: 'backend/database.py',
    dst: '/home/agentuser/wfs-hq/database.py',
  },
  {
    name: 'wfs_events.py (router SSE live :8787)',
    src: 'backend_live/wfs_events.py',
    dst: '/home/agentuser/wfs-office/wfs_events.py',
  },
  {
    name: 'wfs_sh_console.py (router sh console live :8787)',
    src: 'backend_live/wfs_sh_console.py',
    dst: '/home/agentuser/wfs-office/wfs_sh_console.py',
  },
  {
    name: 'wfs_dashboard_stats.py (router dashboard live :8787)',
    src: 'backend_live/wfs_dashboard_stats.py',
    dst: '/home/agentuser/wfs-office/wfs_dashboard_stats.py',
  },
  {
    name: 'sandbox_exec.py (eksekusi sandbox, gateway :8787)',
    src: 'backend/sandbox_exec.py',
    dst: '/home/agentuser/wfs-office/sandbox_exec.py',
  },
  {
    name: 'docker_sandbox.py (core wfs-hq :9503)',
    src: 'backend/docker_sandbox.py',
    dst: '/home/agentuser/wfs-hq/docker_sandbox.py',
  },
  {
    name: 'orchestrator.py (core wfs-hq :9503)',
    src: 'backend/orchestrator.py',
    dst: '/home/agentuser/wfs-hq/orchestrator.py',
  },
  {
    name: 'project_api.py (core wfs-hq :9503)',
    src: 'backend/project_api.py',
    dst: '/home/agentuser/wfs-hq/project_api.py',
  },
  {
    name: 'static_serve.py (core wfs-hq :9503)',
    src: 'backend/static_serve.py',
    dst: '/home/agentuser/wfs-hq/static_serve.py',
  },
]

describe('drift-gate sisa permukaan produksi — 9 pasang (siklus 210)', () => {
  it('census 9 pasang ter-track: sumber repo ada semua, tidak ada pasangan terlewat', () => {
    expect(PAIRS).toHaveLength(9)
    for (const p of PAIRS) {
      expect(existsSync(resolve(REPO, p.src)), `sumber ${p.src} harus ada`).toBe(true)
      expect(p.dst.startsWith('/home/agentuser/'), `${p.name}: dst wajib path produksi absolut`).toBe(true)
    }
    // Nama dst unik (tidak ada pasangan yang menimpa satu file dua kali).
    const dsts = new Set(PAIRS.map((p) => p.dst))
    expect(dsts.size).toBe(9)
  })

  it.each(PAIRS)('produksi IDENTIK dgn sumber: $name', (p) => {
    const dst = p.dst
    if (!existsSync(dst)) return // CI-safe: runner tanpa produksi — skip sha saja
    expect(sha(dst)).toBe(sha(resolve(REPO, p.src)))
  })

  it('database.py = gerbang approval: kontrak importlib fallback utuh di wfs_tasks (PermissionError LOUD)', () => {
    const t = readFileSync(resolve(REPO, 'backend_live/wfs_tasks.py'), 'utf-8')
    expect(t).toContain('_db_py = os.path.expanduser("~/wfs-hq/database.py")')
    expect(t).toContain('spec_from_file_location("wfs_database_live", _db_py)')
    expect(t).toContain("PermissionError('project_launch approval required (database.py tidak ditemukan)')")
  })

  it('database.py kontrak inti: get_db WAL + tabel approvals + add/set/list approval + seed agen', () => {
    const s = readFileSync(resolve(REPO, 'backend/database.py'), 'utf-8')
    expect(s).toContain('def get_db():')
    expect(s).toContain('PRAGMA journal_mode=WAL')
    expect(s).toContain('CREATE TABLE IF NOT EXISTS approvals')
    expect(s).toContain('def add_approval(')
    expect(s).toContain('def list_approvals(')
    expect(s).toContain('def set_approval(')
    expect(s).toContain("status TEXT DEFAULT 'pending'")
    expect(s).toContain('def get_overview():')
    expect(s).toContain("DEFAULT 'idle'") // agen di-seed idle — bukan running palsu
  })

  it('3 router live read-only: URI mode=ro + route kontrak wire utuh', () => {
    const ev = readFileSync(resolve(REPO, 'backend_live/wfs_events.py'), 'utf-8')
    expect(ev).toContain('@router.get("/api/events")')
    expect(ev).toContain('mode=ro')
    expect(ev).toContain('"type": "connected"')
    expect(ev).toContain(': ping') // keepalive anti-proxy-idle
    const shc = readFileSync(resolve(REPO, 'backend_live/wfs_sh_console.py'), 'utf-8')
    for (const route of ['/api/sh/overview', '/api/approvals', '/api/projects/{pid}/files',
      '/api/projects/{pid}/file', '/api/projects/{pid}/logs', '/api/projects/{pid}/git']) {
      expect(shc).toContain(`@router.get("${route}")`)
    }
    expect(shc).toContain('mode=ro')
    const st = readFileSync(resolve(REPO, 'backend_live/wfs_dashboard_stats.py'), 'utf-8')
    expect(st).toContain('@router.get("/api/dashboard/stats")')
    expect(st).toContain('mode=ro')
  })

  it('3 router live terpasang di superset wfs_server (import guarded + include_router)', () => {
    const s = readFileSync(resolve(REPO, 'backend_live/wfs_server.py'), 'utf-8')
    expect(s).toContain('import wfs_events as _wfs_ev')
    expect(s).toContain('import wfs_sh_console as _wfs_shc')
    expect(s).toContain('import wfs_dashboard_stats as _wfs_stats')
    expect(s).toContain('app.include_router(_wfs_ev.router)')
    expect(s).toContain('app.include_router(_wfs_shc.router)')
    expect(s).toContain('app.include_router(_wfs_stats.router)')
  })

  it('sandbox_exec dipanggil jalur eksekusi live gateway + kontrak fungsi utuh', () => {
    expect(readFileSync(resolve(REPO, 'backend_live/wfs_tasks.py'), 'utf-8')).toContain('import sandbox_exec')
    const srv = readFileSync(resolve(REPO, 'backend_live/wfs_server.py'), 'utf-8')
    expect((srv.match(/import sandbox_exec/g) || []).length).toBeGreaterThanOrEqual(2)
    const s = readFileSync(resolve(REPO, 'backend/sandbox_exec.py'), 'utf-8')
    expect(s).toContain('def run_in_sandbox(')
    expect(s).toContain('def run_tests_in_sandbox(')
    expect(s).toContain('"docker", "exec", name')
    expect(s).toContain('except subprocess.TimeoutExpired:')
  })

  it('core wfs-hq kontrak utuh di sumber repo: docker_sandbox/orchestrator/project_api/static_serve', () => {
    const ds = readFileSync(resolve(REPO, 'backend/docker_sandbox.py'), 'utf-8')
    expect(ds).toContain('class DockerSandboxManager:')
    expect(ds).toContain('def scaffold_project(')
    expect(ds).toContain('def start_container(')
    expect(ds).toContain('def allocate_port(')
    expect(readFileSync(resolve(REPO, 'backend/orchestrator.py'), 'utf-8'))
      .toContain('class TaskOrchestrator:')
    const pa = readFileSync(resolve(REPO, 'backend/project_api.py'), 'utf-8')
    expect(pa).toContain('def project_snapshot():')
    expect(pa).toContain('def handle_project(self):')
    const ss = readFileSync(resolve(REPO, 'backend/static_serve.py'), 'utf-8')
    expect(ss).toContain('def cache_control_for(')
    expect(ss).toContain('def maybe_gzip(')
  })
})
