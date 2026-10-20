import { describe, it, expect } from 'vitest';
import {
  keyclickFreq, stepEnvelope, chimeStart, masterGainValue,
  CHIME_FREQS, KEYCLICK_BASE_FREQ, KEYCLICK_JITTER, KEYCLICK_GAIN,
  KEYCLICK_END_GAIN, KEYCLICK_SEC, STEP_GAIN, STEP_DECAY, STEP_SEC,
  CHIME_DELAY_SEC, CHIME_GAIN, CHIME_END_GAIN, CHIME_TONE_SEC, MUTED_KEY,
} from '../scene/parts/sound_spec.js';

describe('sound_spec — keyclick', () => {
  it('konstanta sesuai nilai historis', () => {
    expect(KEYCLICK_BASE_FREQ).toBe(800);
    expect(KEYCLICK_JITTER).toBe(400);
    expect(KEYCLICK_GAIN).toBe(0.01);
    expect(KEYCLICK_END_GAIN).toBe(0.001);
    expect(KEYCLICK_SEC).toBe(0.05);
  });
  it('frekuensi dalam rentang 800..1200 utk rng acak', () => {
    let rng = () => 0.7;
    expect(keyclickFreq(rng)).toBe(800 + 0.7 * 400);
    for (let i = 0; i < 50; i++) {
      const f = keyclickFreq(Math.random);
      expect(f).toBeGreaterThanOrEqual(800);
      expect(f).toBeLessThanOrEqual(1200);
    }
  });
  it('rng 0 → base, rng 1 → base+jitter (boundary)', () => {
    expect(keyclickFreq(() => 0)).toBe(800);
    expect(keyclickFreq(() => 1)).toBe(1200);
  });
});

describe('sound_spec — langkah (white noise)', () => {
  it('konstanta sesuai nilai historis', () => {
    expect(STEP_GAIN).toBe(0.02);
    expect(STEP_DECAY).toBe(5);
    expect(STEP_SEC).toBe(0.04);
  });
  it('envelope = 1 di sampel pertama', () => {
    expect(stepEnvelope(0, 1000)).toBe(1);
  });
  it('envelope menurun monoton', () => {
    const n = 1000;
    let prev = stepEnvelope(0, n);
    for (let i = 1; i < n; i += 100) {
      const v = stepEnvelope(i, n);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });
  it('envelope di akhir buffer ≈ exp(-5) ≈ 0.0067', () => {
    const n = 1000;
    expect(stepEnvelope(n - 1, n)).toBeCloseTo(Math.exp(-5), 2);
  });
});

describe('sound_spec — chime meeting', () => {
  it('tiga nada C5-E5-G5 sesuai historis', () => {
    expect(CHIME_FREQS).toEqual([523.25, 659.25, 783.99]);
  });
  it('konstanta delay/gain sesuai historis', () => {
    expect(CHIME_DELAY_SEC).toBe(0.15);
    expect(CHIME_GAIN).toBe(0.04);
    expect(CHIME_END_GAIN).toBe(0.001);
    expect(CHIME_TONE_SEC).toBe(0.5);
  });
  it('chimeStart: nada ke-i mulai di i*0.15', () => {
    expect(chimeStart(0)).toBe(0);
    expect(chimeStart(1)).toBeCloseTo(0.15);
    expect(chimeStart(2)).toBeCloseTo(0.3);
  });
  it('chime berakhir setelah nada terakhir selesai', () => {
    const total = chimeStart(CHIME_FREQS.length - 1) + CHIME_TONE_SEC;
    expect(total).toBeCloseTo(0.8);
  });
});

describe('sound_spec — mute', () => {
  it('kunci localStorage sesuai historis', () => {
    expect(MUTED_KEY).toBe('wfs_audio_muted');
  });
  it('masterGainValue 0 saat muted, 1 saat tidak', () => {
    expect(masterGainValue(true)).toBe(0);
    expect(masterGainValue(false)).toBe(1);
  });
});
