import { describe, it, expect } from 'vitest';
import {
  keyclickFreq, stepEnvelope, chimeStart, taskDoneStart, taskFailStart, masterGainValue,
  CHIME_FREQS, KEYCLICK_BASE_FREQ, KEYCLICK_JITTER, KEYCLICK_GAIN,
  KEYCLICK_END_GAIN, KEYCLICK_SEC, STEP_GAIN, STEP_DECAY, STEP_SEC,
  CHIME_DELAY_SEC, CHIME_GAIN, CHIME_END_GAIN, CHIME_TONE_SEC, MUTED_KEY,
  TASK_DONE_FREQS, TASK_DONE_DELAY_SEC, TASK_DONE_GAIN, TASK_DONE_END_GAIN, TASK_DONE_TONE_SEC,
  TASK_FAIL_FREQS, TASK_FAIL_DELAY_SEC, TASK_FAIL_GAIN, TASK_FAIL_END_GAIN, TASK_FAIL_TONE_SEC,
  SELECT_FREQ, SELECT_GAIN, SELECT_END_GAIN, SELECT_SEC,
  VOLUME_KEY, DEFAULT_VOLUME,
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

describe('sound_spec — mute & volume', () => {
  it('kunci localStorage sesuai spesifikasi', () => {
    expect(MUTED_KEY).toBe('wfs_audio_muted');
    expect(VOLUME_KEY).toBe('wfs_audio_volume');
    expect(DEFAULT_VOLUME).toBe(1.0);
  });
  it('masterGainValue 0 saat muted apapun volumenya', () => {
    expect(masterGainValue(true)).toBe(0);
    expect(masterGainValue(true, 1)).toBe(0);
    expect(masterGainValue(true, 0.5)).toBe(0);
  });
  it('masterGainValue mengembalikan volume ter-clamp saat unmuted', () => {
    expect(masterGainValue(false)).toBe(DEFAULT_VOLUME);
    expect(masterGainValue(false, 0.5)).toBe(0.5);
    expect(masterGainValue(false, 1.5)).toBe(1);
    expect(masterGainValue(false, -0.2)).toBe(0);
    expect(masterGainValue(false, NaN)).toBe(DEFAULT_VOLUME);
  });
});

describe('sound_spec — task done (notifikasi sukses)', () => {
  it('4 nada ceria C5-E5-G5-C6 berurutan naik', () => {
    expect(TASK_DONE_FREQS).toEqual([523.25, 659.25, 783.99, 1046.50]);
    for (let i = 1; i < TASK_DONE_FREQS.length; i++) {
      expect(TASK_DONE_FREQS[i]).toBeGreaterThan(TASK_DONE_FREQS[i - 1]);
    }
  });
  it('konstanta timing & gain task done proporsional', () => {
    expect(TASK_DONE_DELAY_SEC).toBe(0.09);
    expect(TASK_DONE_GAIN).toBe(0.04);
    expect(TASK_DONE_END_GAIN).toBe(0.001);
    expect(TASK_DONE_TONE_SEC).toBe(0.35);
  });
  it('taskDoneStart: jadwal nada ke-i linier delay 0.09s', () => {
    expect(taskDoneStart(0)).toBe(0);
    expect(taskDoneStart(1)).toBeCloseTo(0.09);
    expect(taskDoneStart(3)).toBeCloseTo(0.27);
  });
});

describe('sound_spec — task fail & select blip', () => {
  it('task fail nada peringatan A4-Eb4 (tritone turun)', () => {
    expect(TASK_FAIL_FREQS).toEqual([440.0, 311.13]);
    expect(TASK_FAIL_FREQS[0]).toBeGreaterThan(TASK_FAIL_FREQS[1]);
    expect(TASK_FAIL_DELAY_SEC).toBe(0.14);
    expect(taskFailStart(0)).toBe(0);
    expect(taskFailStart(1)).toBeCloseTo(0.14);
  });
  it('select blip: C6 singkat & halus', () => {
    expect(SELECT_FREQ).toBe(1046.50);
    expect(SELECT_GAIN).toBe(0.015);
    expect(SELECT_SEC).toBe(0.04);
  });
});
