import { describe, it, expect } from 'vitest';
import {
  keyclickFreq, stepEnvelope, chimeStart, taskDoneStart, taskFailStart, taskUrgentStart, masterGainValue,
  CHIME_FREQS, KEYCLICK_BASE_FREQ, KEYCLICK_JITTER, KEYCLICK_GAIN,
  KEYCLICK_END_GAIN, KEYCLICK_SEC, STEP_GAIN, STEP_DECAY, STEP_SEC,
  CHIME_DELAY_SEC, CHIME_GAIN, CHIME_END_GAIN, CHIME_TONE_SEC, MUTED_KEY,
  TASK_DONE_FREQS, TASK_DONE_DELAY_SEC, TASK_DONE_GAIN, TASK_DONE_END_GAIN, TASK_DONE_TONE_SEC,
  TASK_FAIL_FREQS, TASK_FAIL_DELAY_SEC, TASK_FAIL_GAIN, TASK_FAIL_END_GAIN, TASK_FAIL_TONE_SEC,
  TASK_URGENT_FREQS, TASK_URGENT_DELAY_SEC, TASK_URGENT_GAIN, TASK_URGENT_END_GAIN, TASK_URGENT_TONE_SEC,
  SELECT_FREQ, SELECT_GAIN, SELECT_END_GAIN, SELECT_SEC,
  VOLUME_KEY, DEFAULT_VOLUME, VOLUME_PRESETS, VOLUME_PRESET_LABELS,
  clampVolume, loadAudioVolume, saveAudioVolume, formatVolumePercent,
  AMBIENCE_KEY, AMBIENCE_VOL_KEY, DEFAULT_AMBIENCE_ENABLED, DEFAULT_AMBIENCE_VOLUME,
  AMBIENCE_BASE_FREQ, AMBIENCE_OVERTONE_FREQ, AMBIENCE_FILTER_FREQ, AMBIENCE_FILTER_Q,
  AMBIENCE_BASE_GAIN, AMBIENCE_RAMP_SEC, AMBIENCE_PREVIEW_SEC, AMBIENCE_PRESETS, AMBIENCE_PRESET_LABELS,
  clampAmbienceVolume, loadAmbienceEnabled, saveAmbienceEnabled, loadAmbienceVolume, saveAmbienceVolume,
  formatAmbiencePercent, calcAmbienceGain, generatePinkNoiseData,
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
  it('preset volume & label lengkap [0.25, 0.50, 0.80, 1.00]', () => {
    expect(VOLUME_PRESETS).toEqual([0.25, 0.50, 0.80, 1.00]);
    VOLUME_PRESETS.forEach(p => {
      expect(VOLUME_PRESET_LABELS[p]).toBeDefined();
    });
  });
  it('clampVolume: membatasi nilai antara 0 dan 1, fallback DEFAULT_VOLUME jika bukan angka', () => {
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(-0.1)).toBe(0);
    expect(clampVolume(1.2)).toBe(1);
    expect(clampVolume('abc')).toBe(DEFAULT_VOLUME);
    expect(clampVolume(null)).toBe(DEFAULT_VOLUME);
  });
  it('loadAudioVolume & saveAudioVolume membaca/menulis ke storage dengan aman', () => {
    const mockStorage = {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = String(v); },
    };
    expect(loadAudioVolume(mockStorage)).toBe(DEFAULT_VOLUME);
    saveAudioVolume(mockStorage, 0.8);
    expect(mockStorage.getItem(VOLUME_KEY)).toBe('0.8');
    expect(loadAudioVolume(mockStorage)).toBe(0.8);
    // null storage fallback
    expect(loadAudioVolume(null)).toBe(DEFAULT_VOLUME);
    expect(saveAudioVolume(null, 0.5)).toBe(false);
  });
  it('formatVolumePercent memformat persentase bulat', () => {
    expect(formatVolumePercent(0)).toBe('0%');
    expect(formatVolumePercent(0.25)).toBe('25%');
    expect(formatVolumePercent(0.8)).toBe('80%');
    expect(formatVolumePercent(1)).toBe('100%');
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

describe('sound_spec — task urgent alert (prioritas kritis)', () => {
  it('task urgent 2 nada naik tajam & cerah A5-D6', () => {
    expect(TASK_URGENT_FREQS).toEqual([880.0, 1174.66]);
    expect(TASK_URGENT_FREQS[1]).toBeGreaterThan(TASK_URGENT_FREQS[0]);
  });
  it('konstanta timing & gain task urgent proporsional', () => {
    expect(TASK_URGENT_DELAY_SEC).toBe(0.08);
    expect(TASK_URGENT_GAIN).toBe(0.035);
    expect(TASK_URGENT_END_GAIN).toBe(0.001);
    expect(TASK_URGENT_TONE_SEC).toBe(0.18);
  });
  it('taskUrgentStart: jadwal nada ke-i delay 0.08s', () => {
    expect(taskUrgentStart(0)).toBe(0);
    expect(taskUrgentStart(1)).toBeCloseTo(0.08);
    expect(taskUrgentStart(2)).toBeCloseTo(0.16);
  });
});

describe('sound_spec — ambience ruangan kantor (Web Audio HVAC / room hum)', () => {
  it('konstanta ambience sesuai spesifikasi', () => {
    expect(AMBIENCE_KEY).toBe('wfs_audio_ambience');
    expect(AMBIENCE_VOL_KEY).toBe('wfs_audio_ambience_volume');
    expect(DEFAULT_AMBIENCE_ENABLED).toBe(false);
    expect(DEFAULT_AMBIENCE_VOLUME).toBe(0.35);
    expect(AMBIENCE_BASE_FREQ).toBe(55.0);
    expect(AMBIENCE_OVERTONE_FREQ).toBe(110.0);
    expect(AMBIENCE_FILTER_FREQ).toBe(180);
    expect(AMBIENCE_FILTER_Q).toBe(1.0);
    expect(AMBIENCE_BASE_GAIN).toBe(0.015);
    expect(AMBIENCE_RAMP_SEC).toBe(0.4);
    expect(AMBIENCE_PREVIEW_SEC).toBe(2.5);
    expect(AMBIENCE_PRESETS).toEqual([0.20, 0.40, 0.70, 1.00]);
    expect(AMBIENCE_PRESET_LABELS[0.20]).toBe('20% Halus');
    expect(AMBIENCE_PRESET_LABELS[1.00]).toBe('100% Penuh');
  });

  it('clampAmbienceVolume membatasi rentang 0..1 dan fallback aman', () => {
    expect(clampAmbienceVolume(0.5)).toBe(0.5);
    expect(clampAmbienceVolume(-0.2)).toBe(0);
    expect(clampAmbienceVolume(1.5)).toBe(1);
    expect(clampAmbienceVolume('invalid')).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(clampAmbienceVolume(NaN)).toBe(DEFAULT_AMBIENCE_VOLUME);
  });

  it('loadAmbienceEnabled dan saveAmbienceEnabled bekerja dengan aman', () => {
    const mockStorage = {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = String(v); },
    };
    expect(loadAmbienceEnabled(mockStorage)).toBe(false);
    saveAmbienceEnabled(mockStorage, true);
    expect(mockStorage.getItem(AMBIENCE_KEY)).toBe('1');
    expect(loadAmbienceEnabled(mockStorage)).toBe(true);
    saveAmbienceEnabled(mockStorage, false);
    expect(mockStorage.getItem(AMBIENCE_KEY)).toBe('0');
    expect(loadAmbienceEnabled(mockStorage)).toBe(false);

    // null storage fallback
    expect(loadAmbienceEnabled(null)).toBe(false);
    expect(saveAmbienceEnabled(null, true)).toBe(false);
  });

  it('loadAmbienceVolume dan saveAmbienceVolume bekerja dengan aman', () => {
    const mockStorage = {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = String(v); },
    };
    expect(loadAmbienceVolume(mockStorage)).toBe(DEFAULT_AMBIENCE_VOLUME);
    saveAmbienceVolume(mockStorage, 0.6);
    expect(mockStorage.getItem(AMBIENCE_VOL_KEY)).toBe('0.6');
    expect(loadAmbienceVolume(mockStorage)).toBe(0.6);

    // null storage fallback
    expect(loadAmbienceVolume(null)).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(saveAmbienceVolume(null, 0.5)).toBe(false);
  });

  it('formatAmbiencePercent memformat persentase', () => {
    expect(formatAmbiencePercent(0.35)).toBe('35%');
    expect(formatAmbiencePercent(1.0)).toBe('100%');
    expect(formatAmbiencePercent(0)).toBe('0%');
  });

  it('calcAmbienceGain menghasilkan gain yang tepat saat aktif / senyap saat mute atau disabled', () => {
    expect(calcAmbienceGain(1.0, 1.0, false, true)).toBeCloseTo(0.015, 5);
    expect(calcAmbienceGain(0.8, 0.5, false, true)).toBeCloseTo(0.8 * 0.5 * 0.015, 5);
    // muted -> 0
    expect(calcAmbienceGain(1.0, 1.0, true, true)).toBe(0);
    // disabled -> 0
    expect(calcAmbienceGain(1.0, 1.0, false, false)).toBe(0);
  });

  it('generatePinkNoiseData menghasilkan Float32Array dengan nilai finite dan rentang wajar', () => {
    const samples = 1000;
    const data = generatePinkNoiseData(samples);
    expect(data).toBeInstanceOf(Float32Array);
    expect(data.length).toBe(samples);

    let maxVal = -Infinity;
    let minVal = Infinity;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const v = data[i];
      expect(Number.isFinite(v)).toBe(true);
      if (v > maxVal) maxVal = v;
      if (v < minVal) minVal = v;
      sum += v;
    }
    // Pink noise data berada dalam kisaran amplitude audio normal (-1..1)
    expect(maxVal).toBeLessThan(1.2);
    expect(minVal).toBeGreaterThan(-1.2);
    // Rata-rata mendekati nol (DC offset rendah)
    expect(Math.abs(sum / samples)).toBeLessThan(0.3);
  });
});
