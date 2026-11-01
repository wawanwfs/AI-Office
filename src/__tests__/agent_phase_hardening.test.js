import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 199: hardening timing e2e_agent_cycle.py + e2e_office_phase.py
// (koreksi kandidat (c) 198: audit pola sleep-tunggal — hasil audit KEDUANYA
// TIDAK punya sleep-tunggal, sudah poll-until-change; defek nyata kelas sama
// dgn zoom_follow 198 ada di BUDGET, bukan di pola tunggu):
//
//  a1 agent_cycle — ev() mengembalikan {"TIMEOUT": true} saat budget pump
//     habis, padahal eval one-shot besar bisa SUDAH selesai di halaman
//     (reply meleset dari budget). IIFE TES1-3 (2×16×200ms ideal 6.4 dtk)
//     dgn deadline wait=40 dtk, sementara komentar TES4 skrip sendiri:
//     "tiap await bisa tersendat ~2 dtk" di SwiftShader → budget kempes
//     saat VM load berat (kondisi persis 2 FAIL 197 zoom_follow). TES4/5
//     sudah 90 — inkonsisten. Fix: wait 40→75 utk TES1-3 + sisa-read SATU
//     kali (pump(15)) sebelum menyatakan TIMEOUT — side-effect-free, eval
//     yang selesai terlambat tetap terbaca (TIMES_OK dilaporkan di verdict).
//  b1 office_phase — wait_id(tries=200, timeout=20) = worst case 66 MENIT
//     tanpa deadline total (reply hilang tapi socket hidup) → cron bisa
//     menggantung. Fix: deadline total 60 dtk.
//  b2 office_phase — ev() menelan exceptionDetails senyap → FAIL "chip
//     tidak muncul" tanpa diagnosis. Fix: surfacing _exc (pola 198).
//
// Kriteria inti KEDUA probe TIDAK berubah: agent_cycle = 6 tes C/Shift+C/
// Escape/guard Help/orbit; office_phase = chip fase HUD + __setTime(720).
//
// Sumber kebenaran = teks skrip (unit Python butuh Xvfb :99 + chrome —
// di luar vitest; pola zoom_follow_hardening 198).

const here = fileURLToPath(new URL('.', import.meta.url))
const agentCycle = readFileSync(resolve(here, '../../scripts/e2e_agent_cycle.py'), 'utf-8')
const officePhase = readFileSync(resolve(here, '../../scripts/e2e_office_phase.py'), 'utf-8')

describe('e2e_agent_cycle.py — budget one-shot & sisa-read (siklus 199)', () => {
  it('a1: deadline ev() > worst-case loop in-page — TES1-3 wait=75, TES4-5 tetap 90, tidak ada wait=40', () => {
    expect(agentCycle).toContain('wait=75, await_promise=True')
    expect(agentCycle.match(/wait=75, await_promise=True/g)).toHaveLength(3)
    expect(agentCycle.match(/wait=90, await_promise=True/g)).toHaveLength(2)
    expect(agentCycle).not.toContain('wait=40, await_promise=True')
    // alasan terdokumentasi di sumber (bukan magic number)
    expect(agentCycle).toContain('40 dtk habis saat VM load berat')
  })

  it('a1: sisa-read SATU kali sebelum TIMEOUT — eval terlambat tetap terbaca, TIMEOUT tetap jujur', () => {
    expect(agentCycle).toContain('late = pump(15, want_id=myid)')
    expect(agentCycle).toContain('TIMES_OK += 1')
    // TIMEOUT tetap ada utk kasus benar-benar macet
    expect(agentCycle).toContain('return {"TIMEOUT": True}')
    // sisa-read SEBELUM return TIMEOUT (urutan benar)
    const lateIdx = agentCycle.indexOf('late = pump(15')
    const toIdx = agentCycle.indexOf('return {"TIMEOUT": True}')
    expect(lateIdx).toBeGreaterThan(-1)
    expect(toIdx).toBeGreaterThan(lateIdx)
  })

  it('a1: TIMES_OK dilaporkan di verdict (auditability pola 193/195)', () => {
    expect(agentCycle).toContain('if TIMES_OK:')
    expect(agentCycle).toContain('eval one-shot terselamatkan lewat sisa-read')
  })

  it('kriteria inti 181 utuh: 6 tes C/Shift+C/Escape/guard Help/orbit + hooks', () => {
    expect(agentCycle).toContain('window.__agentCycle()')
    expect(agentCycle).toContain("press('c')")
    expect(agentCycle).toContain("press('C', true)")
    expect(agentCycle).toContain('.help-shortcut-grid')
    expect(agentCycle).toContain('orbitMoved')
    expect(agentCycle).toContain('window.__scene && !!window.__agentCycle && !!window.__agentData')
    expect(agentCycle).toContain('TES6 error window = 0')
  })
})

describe('e2e_office_phase.py — deadline total & exceptionDetails (siklus 199)', () => {
  it('b1: wait_id punya deadline TOTAL 60 dtk — bukan 200×20 dtk = 66 menit', () => {
    expect(officePhase).toContain('deadline = time.time() + 60')
    expect(officePhase).toContain('timeout=min(20, remaining)')
    expect(officePhase).toContain('if remaining <= 0:')
    expect(officePhase).toContain('return None')
  })

  it('b2: exceptionDetails di-surface sebagai _exc — tidak ditelan senyap', () => {
    expect(officePhase).toContain('exceptionDetails')
    expect(officePhase).toContain('res["_exc"]')
  })

  it('kriteria inti 141 utuh: chip fase HUD + __setTime(720) + tunggu agents>=26', () => {
    expect(officePhase).toContain(".hud .phase-chip")
    expect(officePhase).toContain('__setTime(720)')
    expect(officePhase).toContain('window.__agentData?window.__agentData.length:-1')
    expect(officePhase).toContain('v >= 26')
    expect(officePhase).toContain('Istirahat makan siang')
    // verdict tetap bandingkan label berubah (bukan angka ajaib baru)
    expect(officePhase).toContain("chip2.get('label') != chip.get('label')")
  })
})
