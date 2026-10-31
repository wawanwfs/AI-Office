import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Siklus 188: hardening MUTE-CHECK e2e_audio_signal.py (kandidat (c) siklus
// 187) — verdict MUTE-LEAK PALSU (~1 dari 4 run) karena buffer analyser 2048
// sampel (~46 ms audio @44.1k) masih berisi sinyal CHAIN (rms~0.14) saat poll
// pertama: null-sink fast-forward + hanya ~2 poll per span → best teracuni
// data PRA-mute. Bukti diag siklus 188: timeline [dt=0, rms=0.123, mgGain=0]
// — rms tinggi PADAHAL masterGain sudah 0 di poll yang sama → basi, bukan
// bocor. Engine mute produk BENAR (sound_spec.masterGainValue: muted→0).
// Sumber kebenaran = teks scripts/e2e_audio_signal.py (unit nyata butuh Xvfb
// :99 + chrome-headless-shell — di luar vitest; pola shot_mobile.test.js 187).

const here = fileURLToPath(new URL('.', import.meta.url))
const src = readFileSync(resolve(here, '../../scripts/e2e_audio_signal.py'), 'utf-8')

describe('e2e_audio_signal.py — MUTE-CHECK anti-basi (siklus 188)', () => {
  it('flush buffer analyser 2x SEBELUM loop sampling (basi dibuang)', () => {
    expect(src).toContain('an.getFloatTimeDomainData(buf);\n  an.getFloatTimeDomainData(buf);')
    // flush HARUS di dalam MUTE_JS (setelah setMuted(true) probe), bukan tempat lain
    const mute = src.split('MUTE_JS = r"""')[1].split('"""')[0]
    expect(mute).toContain('an.getFloatTimeDomainData(buf);\n  an.getFloatTimeDomainData(buf);')
    expect(mute).toContain('eng.setMuted(true);')
  })

  it('poll#0 dikecualikan dari best (window basi ~46ms = cuma poll pertama)', () => {
    expect(src).toContain('if (polls > 0) best = Math.max(best, rms);')
  })

  it('mgMin dicatat = bukti gain 0 selama sampling (pembeda basi vs bug produk)', () => {
    expect(src).toContain('mgMin = Math.min(mgMin, eng.masterGainNode().gain.value);')
    expect(src).toContain('{ best, polls, mgMin, mutedNow: eng.isMuted(),')
  })

  it('Python mencetak polls + mgMin + post-hoc mgMin>0 = indikasi bug produk', () => {
    expect(src).toContain("f\"MUTE-CHECK: best_rms={mute_rms:.2e} (harus < 1e-4) polls={mc.get('polls')} \"")
    expect(src).toContain('mgMin>0 saat mute_rms tinggi → indikasi bug produk')
  })

  it('kekuatan gate utuh: threshold mute<1e-4 & verdict MUTE-LEAK tidak diubah', () => {
    expect(src).toContain('mute_ok = 0 <= mute_rms < 1e-4')
    expect(src).toContain('"MUTE-LEAK" if not mute_ok else "FAIL-OTHER"')
  })

  it('docstring mendokumentasikan akar masalah & keputusan (auditability)', () => {
    expect(src).toContain('Hardening siklus 188 (MUTE-LEAK palsu ~1 dari 4 run)')
    expect(src).toContain('rms 0.123 padahal mgGain=0 di poll yang sama')
  })
})
