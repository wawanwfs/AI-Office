import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 202: hardening transport TERAKHIR — subprocess.run sinkron tanpa timeout=.
// Pelengkap 197 (WS), 199/200 (wait_id), 201 (urlopen/curl): kini SEMUA sumber
// eksekusi proses sinkron di scripts/ terpagari.
//
// Defek (census siklus 202): 212 call-site Popen/run tanpa timeout=; Popen
// (Xvfb/chrome/http.server, daemon by design — dibenarkan) TAPI subprocess.run
// sinkron yang MENUNGGU bisa menggantung cron tanpa batas:
//   - 45+ call "xdpyinfo -display :99" (health-check X11) di 59 file — socket
//     X11 macet (lock screen/Xvfb zombie) = run() menggantung selamanya.
//   - 3x sh() di apply_dashboard_stats/apply_events/apply_sh_console —
//     "sudo systemctl restart wfs-office" bisa menggantung saat systemd
//     menunggu stop job (rare tapi nyata) → patcher apply ikut menggantung.
//   - pkill + cp di e2e_admin_panel; docker run -d/--rm -f di e2e_widget_chat.
//   - process.wait() pasca-kill di test_runtime_layout (terminate sudah 10s,
//     kill() tanpa reaper = zombie).
//   - 4x os.system(pkill chrome) di pinch/orbit_keys/input_edges/dtap —
//     os.system tak bisa diberi deadline; dikonversi subprocess.run(timeout=10).
// Guard ini memagari: setiap subprocess.run/call/check_call/check_output di
// scripts/*.py wajib memuat timeout= (balanced-paren scan; Popen dikecualikan —
// non-blocking by design; .wait()/.communicate() polos juga pelanggaran).
// Census angka eksak: menambah file/run tanpa timeout wajib memperbarui census.

const here = fileURLToPath(new URL('.', import.meta.url))
const SCRIPTS = resolve(here, '../../scripts')

// Buang baris komentar penuh (scan saja — indeks tidak dipertahankan).
function stripFullLineComments(src) {
  return src
    .split('\n')
    .map((l) => (l.trimStart().startsWith('#') ? '' : l))
    .join('\n')
}

// Balanced-paren scan semua call subprocess.run/call/check_call/check_output.
// Popen dikecualikan (non-blocking by design; wait/communicate-nya dipagar
// terpisah di bawah).
export function pySubprocRuns(src) {
  const code = stripFullLineComments(src)
  const out = []
  const re = /subprocess\.(?:run|call|check_call|check_output)\s*\(/g
  let m
  while ((m = re.exec(code))) {
    let i = m.index + m[0].length - 1
    let depth = 0
    let j = i
    while (j < code.length && (depth > 0 || j === i) && j - i < 800) {
      if (code[j] === '(') depth++
      else if (code[j] === ')') {
        depth--
        if (depth === 0) {
          j++
          break
        }
      }
      j++
    }
    const inner = code.slice(i + 1, j - 1).trim()
    if (!inner) continue
    out.push({ inner, hasTimeout: /timeout\s*=\s*\d/.test(inner) })
  }
  return out
}

// wait()/communicate() polos (tanpa timeout=N) — di body file mana pun.
export function bareWaits(src) {
  const code = stripFullLineComments(src)
  return code
    .split('\n')
    .map((l, idx) => ({ l, idx: idx + 1 }))
    .filter(({ l }) => /\.(wait|communicate)\(\)/.test(l) && !l.trimStart().startsWith('#'))
    .map(({ idx }) => `line ${idx}`)
}

// os.system = eksekusi proses TANPA kemungkinan deadline — dilarang di scripts/.
export function osSystemLines(src) {
  return src
    .split('\n')
    .map((l, idx) => ({ l, idx: idx + 1 }))
    .filter(({ l }) => /os\.system\(/.test(l) && !l.trimStart().startsWith('#'))
    .map(({ idx }) => `line ${idx}`)
}

const PY_ALL = readdirSync(SCRIPTS).filter((f) => f.endsWith('.py')).sort()
const RUN_FILES = PY_ALL.filter((f) => pySubprocRuns(readFileSync(resolve(SCRIPTS, f), 'utf-8')).length > 0)

const sites = (f) => pySubprocRuns(readFileSync(resolve(SCRIPTS, f), 'utf-8'))
const viol = (f) => sites(f).filter((c) => !c.hasTimeout).map((c) => c.inner.slice(0, 60))

describe('subprocess_hardening siklus 202 — scanner self-test', () => {
  it('run tanpa timeout terdeteksi; dengan timeout= patuh', () => {
    expect(pySubprocRuns('subprocess.run(["ls"])')).toEqual([{ inner: '["ls"]', hasTimeout: false }])
    expect(pySubprocRuns('subprocess.run(["ls"], timeout=5)')[0].hasTimeout).toBe(true)
    expect(pySubprocRuns('subprocess.run(["ls"], check=False, timeout=10)')[0].hasTimeout).toBe(true)
  })
  it('multi-baris balanced-paren: timeout di baris berikut tetap terbaca', () => {
    const c = pySubprocRuns('subprocess.run([\n  "sudo", "systemctl", "restart", "wfs-office"\n],\n capture_output=True, text=True, timeout=120)')
    expect(c.length).toBe(1)
    expect(c[0].hasTimeout).toBe(true)
  })
  it('Popen TIDAK dihitung (non-blocking by design); inner kosong diabaikan', () => {
    expect(pySubprocRuns('subprocess.Popen(["Xvfb", ":99"])').length).toBe(0)
    expect(pySubprocRuns('teks docstring subprocess.run() kosong').length).toBe(0)
  })
  it('wait()/communicate() polos terdeteksi; dengan timeout tidak', () => {
    expect(bareWaits('p.wait()')).toEqual(['line 1'])
    expect(bareWaits('p.wait(timeout=10)')).toEqual([])
    expect(bareWaits('p.communicate()')).toEqual(['line 1'])
    expect(bareWaits('# p.wait() di komentar')).toEqual([])
  })
  it('os.system terdeteksi sebagai pelanggaran', () => {
    expect(osSystemLines('os.system("pkill -f x")')).toEqual(['line 1'])
    expect(osSystemLines('# os.system("x") komentar')).toEqual([])
  })
})

describe('subprocess_hardening siklus 202 — census', () => {
  it('census: executable subprocess sites remain guarded even when obsolete scripts are deleted', () => {
    expect(PY_ALL.length).toBeGreaterThan(70)
    expect(RUN_FILES.length).toBeGreaterThanOrEqual(70)
    expect(RUN_FILES).toContain("ci_docker_sandbox_smoke.py")
    const total = RUN_FILES.reduce((n, f) => n + sites(f).length, 0)
    expect(total).toBeGreaterThanOrEqual(77)
  })
})

describe('subprocess_hardening siklus 202 — setiap run sinkron bawa timeout=', () => {
  it.each(RUN_FILES)('%s: 0 subprocess.run sinkron tanpa timeout', (f) => {
    const v = viol(f)
    expect(v, `subprocess.run tanpa timeout di ${f}: ${JSON.stringify(v)}`).toEqual([])
  })
})

describe('subprocess_hardening siklus 202 — wait/os.system terpagari', () => {
  it('0 os.system di seluruh scripts/*.py', () => {
    const v = PY_ALL.flatMap((f) => osSystemLines(readFileSync(resolve(SCRIPTS, f), 'utf-8')).map((l) => `${f}:${l}`))
    expect(v, `os.system di: ${JSON.stringify(v)}`).toEqual([])
  })
  it('0 .wait()/.communicate() polos di seluruh scripts/*.py', () => {
    const v = PY_ALL.flatMap((f) => bareWaits(readFileSync(resolve(SCRIPTS, f), 'utf-8')).map((l) => `${f}:${l}`))
    expect(v, `wait() polos di: ${JSON.stringify(v)}`).toEqual([])
  })
})

describe('subprocess_hardening siklus 202 — anchor file kunci', () => {
  it('e2e_err_probe.py (probe wajib): xdpyinfo bawa timeout=10', () => {
    const src = readFileSync(resolve(SCRIPTS, 'e2e_err_probe.py'), 'utf-8')
    expect(src).toMatch(/subprocess\.run\(\["xdpyinfo", "-display", ":99"\], timeout=10,/)
    expect(viol('e2e_err_probe.py')).toEqual([])
  })
  it('Phase 4 Docker runtime verifier: every synchronous host operation has a deadline', () => {
    const src = readFileSync(resolve(SCRIPTS, 'ci_docker_sandbox_smoke.py'), 'utf-8')
    expect(src).toContain('docker')
    expect(viol('ci_docker_sandbox_smoke.py')).toEqual([])
  })
  it('e2e_widget_chat.py: kontrol kode-lama INLINE data: URL (siklus 273, tanpa docker) + urlopen ber-deadline', () => {
    const src = readFileSync(resolve(SCRIPTS, 'e2e_widget_chat.py'), 'utf-8')
    // Siklus 273: image kontrol `pre-fix-1760000000` sudah tidak ada di host
    // (docker run gagal → blok B FAIL deterministik) → kontrol kini snapshot
    // kode-lama di-inline via data: URL; docker sama sekali tidak boleh kembali.
    expect(src).not.toMatch(/"docker", "run"/)
    expect(src).not.toMatch(/pre-fix-1760000000[^)]*\n\s*old_img/)
    expect(src).toMatch(/data:text\/html;base64/)
    expect(src).toMatch(/urllib\.request\.urlopen\([^)]*timeout=/)
    expect(viol('e2e_widget_chat.py')).toEqual([])
  })
  it('e2e_pinch.py: os.system pkill sudah jadi subprocess.run(timeout=10)', () => {
    const src = readFileSync(resolve(SCRIPTS, 'e2e_pinch.py'), 'utf-8')
    expect(src).not.toMatch(/os\.system\(/)
    expect(src).toMatch(/subprocess\.run\(\["pkill", "-f", f"remote-debugging-port=\{PORT\}"\],/)
    expect(src).toMatch(/check=False, capture_output=True, timeout=10\)/)
  })
})
