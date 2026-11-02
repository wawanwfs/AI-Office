import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'

// drift-gate siklus 221: hasil audit eksposur & otentikasi OmniRoute :20128
// terkunci sebagai script yang bisa diulang & wajib lulus saat vitest.
//
// Latar (audit live 2026-11-02):
// - omniroute SATU-SATUNYA container dengan publish port 0.0.0.0
//   (map[20128/tcp:[{invalid IP 20128}]] — HostIP kosong = wildcard).
// - Docker TERBUKTI mem-bypass ufw: nat DOCKER "! -i br-190e604f847d
//   --dport 20128 -j DNAT --to-destination 172.19.0.2:20128" + filter
//   DOCKER ACCEPT; DOCKER-USER kosong. Traffic publish-port lewat
//   FORWARD/DOCKER (sebelum ufw-before-forward) — ufw ALLOW 22/9503/3389/41641
//   TIDAK relevan utk container publish.
// - Node luar (check-host.net 6 node) timeout ke 20128 DAN ke kontrol :22
//   → barrier efektif = Tencent Cloud SG, satu-satunya gerbang internet.
// - Invariant risiko: env container REQUIRE_API_KEY=false; POST
//   /v1/chat/completions TANPA Authorization tidak ditolak 401 (diproxy ke
//   pipeline provider) → OPEN LLM PROXY dalam perimeter (LAN VPC/Tailscale
//   bisa memakai kuota LLM tanpa kredensial). /v1/models tetap 401.
// - Panel admin /dashboard 200 tanpa login (perimeter-only); admin API
//   (/api/keys|settings|providers|config|channels|users) wajib 401.
// - /metrics 404; /docs hanya mengandung placeholder i18n sk-ant***
//   (claudeSetupTokenPlaceholder) — tanpa secret sungguhan.
//
// Guard ini memastikan: (1) script audit ada & executable, (2) coverage
// ceknya tidak menyusut, (3) audit live benar-benar lulus saat test jalan.

const here = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(here, '../..')
const AUDIT = resolve(REPO, 'scripts/audit_omniroute_exposure.py')
const execFileAsync = promisify(execFile)

describe('audit eksposur omniroute :20128 (siklus 221)', () => {
  it('scripts/audit_omniroute_exposure.py ada & executable', () => {
    const st = statSync(AUDIT)
    expect(st.isFile()).toBe(true)
    // executable bit — audit harus bisa dipanggil langsung oleh cron/CI
    expect(st.mode & 0o111).not.toBe(0)
  })

  it('coverage audit tidak menyusut (DNAT + DOCKER ACCEPT + kontrol :22 + REQUIRE_API_KEY + admin 401 + placeholder scan)', () => {
    const s = readFileSync(AUDIT, 'utf-8')
    expect(s).toContain('iptables') // bypass ufw via nat DOCKER DNAT
    expect(s).toContain('20128')
    expect(s).toContain('REQUIRE_API_KEY=false')
    expect(s).toContain('/v1/chat/completions') // probe proxy terbuka
    expect(s).toContain('/v1/models') // 401 wajib
    expect(s).toContain('550f2460k974') // kontrol :22 (barrier = Tencent SG, bukan ufw)
    expect(s).toContain('DOCKER-USER') // kosong = tidak ada pelindung tambahan
    for (const ep of ['/api/keys', '/api/settings', '/api/providers', '/api/config', '/api/channels', '/api/users']) {
      expect(s).toContain(ep) // admin API wajib 401
    }
    expect(s).toContain('claudeSetupTokenPlaceholder') // false-positive eksak yang disaring
    expect(s).toContain('/metrics') // telemetri tidak terekspos
  })

  it('audit live omniroute lulus penuh (semua cek PASS)', async () => {
    try {
      const { stdout } = await execFileAsync('python3', [AUDIT], { timeout: 240_000 })
      expect(stdout).toContain('PASS')
      expect(stdout).not.toContain('[FAIL]')
    } catch (e) {
      // lempar ulang dengan output audit agar gagalnya bisa didiagnosis
      throw new Error(`audit gagal: ${e.message}\n${e.stdout ?? ''}\n${e.stderr ?? ''}`)
    }
  })
})
