import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 201: hardening transport HTTP — pelengkap 197 (WS) + 199/200 (wait_id).
// Census siklus 201: 88/88 call-site urlopen SUDAH bawa timeout= dan 18/18 curl
// SUDAH bawa -m/--max-time (0 pelanggaran) — tapi TANPA guard regresi: satu file
// probe baru cukup untuk mengembalikan kelas hang "urlopen tanpa timeout"
// (urllib default = tanpa batas → cron menggantung selamanya saat service mati/
// setengah-mati; kelas cacat sama dgn b1 199/200 yang sudah dipagari).
//
// Guard ini memagari DUA sumber HTTP keluar di scripts/:
//   py  — setiap call-site urlopen( ... ) harus memuat timeout= DI DALAM argumen
//         (balanced-paren scan multi-baris; baris komentar penuh diabaikan;
//         inner kosong seperti docstring "urlopen().read1()" dilewati).
//   sh  — setiap baris invocation curl (curl diikuti flag/$var/quote) harus
//         memuat -m N atau --max-time N (baris komentar penuh diabaikan).
// Census angka eksak (pola ws_transport_hardening 197): menambah/menghapus file
// dengan HTTP wajib memperbarui census — perubahan diam tidak lolos.
//
// Bukti live siklus 201 (screenshot ReadPixels menghasilkan tepat 1 warning GL
// "GPU stall due to ReadPixels" — artefak probe sendiri): console runtime scene
// BERSIH; seluruh transport kini terpagari WS 64 file + wait_id 14 probe + HTTP 77 file.

const here = fileURLToPath(new URL('.', import.meta.url))
const SCRIPTS = resolve(here, '../../scripts')

// Buang baris komentar penuh (pelestarian indeks tak diperlukan — hanya scan).
function stripFullLineComments(src) {
  return src
    .split('\n')
    .map((l) => (l.trimStart().startsWith('#') ? '' : l))
    .join('\n')
}

// Balanced-paren scan: kembalikan semua inner-argumen call urlopen( ... ).
// Multi-baris didukung; inner kosong (docstring "urlopen().read1()") dilewati.
export function pyHttpCalls(src) {
  const code = stripFullLineComments(src)
  const out = []
  const re = /urlopen\(/g
  let m
  while ((m = re.exec(code))) {
    let i = m.index + m[0].length
    let depth = 1
    let j = i
    while (j < code.length && depth > 0 && j - i < 600) {
      if (code[j] === '(') depth++
      else if (code[j] === ')') depth--
      j++
    }
    const inner = code.slice(i, j - 1).trim()
    if (!inner) continue // artefak komentar/docstring, bukan call
    out.push({ inner, hasTimeout: /timeout\s*=/.test(inner) && !/timeout\s*=\s*0(?![.\d])/.test(inner) })
  }
  return out
}

// Invocation curl = "curl" diikuti flag pendek, flag panjang, $var, atau quote —
// menyaring teks log ("(curl rc=$rc)") sekaligus menangkap curl telanjang tanpa flag.
const CURL_INVOC = /(^|[^\w])curl(\s+)(-[A-Za-z]|--\w|\$|")/
const CURL_DEADLINE = /(^|[^\w-])(-m\s|--max-time\s)/

export function shCurlLines(src) {
  return src
    .split('\n')
    .map((l, idx) => ({ l, idx: idx + 1 }))
    .filter(({ l }) => !l.trimStart().startsWith('#') && CURL_INVOC.test(l))
    .map(({ l, idx }) => ({ idx, hasDeadline: CURL_DEADLINE.test(l) }))
}

const PY_ALL = readdirSync(SCRIPTS).filter((f) => f.endsWith('.py')).sort()
const PY_HTTP = PY_ALL.filter((f) => pyHttpCalls(readFileSync(resolve(SCRIPTS, f), 'utf-8')).length > 0)
const SH_ALL = readdirSync(SCRIPTS).filter((f) => f.endsWith('.sh')).sort()

const pySites = (f) => pyHttpCalls(readFileSync(resolve(SCRIPTS, f), 'utf-8'))
const pyViol = (f) =>
  pySites(f)
    .filter((c) => !c.hasTimeout)
    .map((c) => c.inner.slice(0, 60))
const shViol = (f) =>
  shCurlLines(readFileSync(resolve(SCRIPTS, f), 'utf-8'))
    .filter((c) => !c.hasDeadline)
    .map((c) => `line ${c.idx}`)

describe('http_transport_hardening siklus 201 — scanner self-test', () => {
  it('urlopen tanpa timeout terdeteksi sebagai pelanggaran', () => {
    const c = pyHttpCalls('urlopen("http://x/api")')
    expect(c.length).toBe(1)
    expect(c[0].hasTimeout).toBe(false)
  })
  it('urlopen dengan timeout terdeteksi patuh', () => {
    expect(pyHttpCalls('urlopen("http://x", timeout=3)')[0].hasTimeout).toBe(true)
    expect(pyHttpCalls('urlopen(Request(u), timeout=90).read()')[0].hasTimeout).toBe(true)
    expect(pyHttpCalls('_ur.urlopen(_ur.Request("http://x"), timeout=tmo)')[0].hasTimeout).toBe(true)
  })
  it('multi-baris balanced-paren: timeout di baris berikut tetap terbaca', () => {
    const c = pyHttpCalls('ov = json.loads(urllib.request.urlopen(\n  "http://x/ov", timeout=5).read())')
    expect(c.length).toBe(1)
    expect(c[0].hasTimeout).toBe(true)
  })
  it('inner kosong (docstring urlopen().read1()) dan komentar penuh dilewati', () => {
    expect(pyHttpCalls('teks docstring (urlopen().read1()) — bukan call').length).toBe(0)
    expect(pyHttpCalls('# urlopen("http://x") tanpa timeout di komentar').length).toBe(0)
  })
  it('timeout=0 (tanpa batas) TETAP pelanggaran; komentar sesudah ) tidak menyelamatkan', () => {
    expect(pyHttpCalls('urlopen("http://x", timeout=0)')[0].hasTimeout).toBe(false)
    expect(pyHttpCalls('urlopen("http://x")  # nanti ditambah timeout=5')[0].hasTimeout).toBe(false)
  })
  it('sh: curl tanpa -m terdeteksi; baris log "(curl rc=$rc)" tidak false-positive', () => {
    expect(shCurlLines('h=$(curl -s $BASE/api/health)')).toEqual([{ idx: 1, hasDeadline: false }])
    expect(shCurlLines('h=$(curl -s -m 5 $BASE/api/health)')[0].hasDeadline).toBe(true)
    expect(shCurlLines('h=$(curl -fsS --max-time 10 "$url")')[0].hasDeadline).toBe(true)
    expect(shCurlLines('log "FAIL (curl rc=$rc)"').length).toBe(0)
    expect(shCurlLines('# curl -s http://x di komentar').length).toBe(0)
  })
})

describe('http_transport_hardening siklus 201 — census', () => {
  it('census: 78 file .py dgn call-site urlopen, >=90 call-site, 3 file .sh curl (siklus 206: +1 apply_wfs_hq_server.py)', () => {
    expect(PY_ALL.length).toBeGreaterThan(70)
    expect(PY_HTTP.length).toBe(78)
    const total = PY_HTTP.reduce((n, f) => n + pySites(f).length, 0)
    expect(total).toBeGreaterThanOrEqual(90)
    expect(SH_ALL.length).toBe(3)
  })
})

describe('http_transport_hardening siklus 201 — setiap call-site urlopen bawa timeout=', () => {
  it.each(PY_HTTP)('%s: 0 call-site urlopen tanpa timeout', (f) => {
    const v = pyViol(f)
    expect(v, `urlopen tanpa timeout di ${f}: ${JSON.stringify(v)}`).toEqual([])
  })
})

describe('http_transport_hardening siklus 201 — setiap curl .sh bawa -m/--max-time', () => {
  it.each(SH_ALL)('%s: 0 curl tanpa deadline', (f) => {
    const v = shViol(f)
    expect(v, `curl tanpa -m/--max-time di ${f}: ${JSON.stringify(v)}`).toEqual([])
  })
})

describe('http_transport_hardening siklus 201 — anchor probe wajib', () => {
  it('e2e_err_probe.py (probe wajib): /json/list bawa timeout', () => {
    const src = readFileSync(resolve(SCRIPTS, 'e2e_err_probe.py'), 'utf-8')
    expect(pyViol('e2e_err_probe.py')).toEqual([])
    expect(src).toMatch(/urlopen\(f?"?http:\/\/127\.0\.0\.1:\{PORT\}\/json\/list", timeout=5\)/)
  })
  it('deploy.py (gate hygiene 191): cek 9503 bawa timeout', () => {
    expect(pyViol('deploy.py')).toEqual([])
    expect(readFileSync(resolve(SCRIPTS, 'deploy.py'), 'utf-8')).toMatch(/urlopen\('http:\/\/127\.0\.0\.1:9503\/', timeout=3\)/)
  })
  it('smoke go-live: seluruh curl smoke_go_live.sh ber-deadline (fixture 10/10 go-live)', () => {
    expect(shViol('smoke_go_live.sh')).toEqual([])
    expect(shCurlLines(readFileSync(resolve(SCRIPTS, 'smoke_go_live.sh'), 'utf-8')).length).toBe(8)
  })
})
