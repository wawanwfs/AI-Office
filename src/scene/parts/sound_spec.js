// Spesifikasi murni untuk sound system kantor (diekstrak dari OfficeScene.js).
// Tidak ada dependency THREE/Web Audio — parameter & rumus diuji unit.

// keyclick: oscillator square, frekuensi acak 800..1200 Hz, gain 0.01,
// ramp eksponensial ke 0.001 selama KEYCLICK_SEC, total durasi sama.
export const KEYCLICK_BASE_FREQ = 800;
export const KEYCLICK_JITTER = 400;
export const KEYCLICK_GAIN = 0.01;
export const KEYCLICK_END_GAIN = 0.001;
export const KEYCLICK_SEC = 0.05;

// langkah: buffer white-noise, gain 0.02, envelope eksponensial decay exp(-i/N*5)
export const STEP_GAIN = 0.02;
export const STEP_DECAY = 5;
export const STEP_SEC = 0.04;

// chime meeting: tiga nada C5-E5-G5, delay 150 ms antar nada,
// gain 0.04 ramp ke 0.001 selama 0.5 s per nada
export const CHIME_FREQS = [523.25, 659.25, 783.99];
export const CHIME_DELAY_SEC = 0.15;
export const CHIME_GAIN = 0.04;
export const CHIME_END_GAIN = 0.001;
export const CHIME_TONE_SEC = 0.5;

// mute: masterGain 0 saat muted, 1 saat tidak; persist di localStorage 'wfs_audio_muted'
export const MUTED_KEY = 'wfs_audio_muted';

// notifikasi task selesai (done): empat nada naik C5-E5-G5-C6 yang ceria & harmonis
export const TASK_DONE_FREQS = [523.25, 659.25, 783.99, 1046.50];
export const TASK_DONE_DELAY_SEC = 0.09;
export const TASK_DONE_GAIN = 0.04;
export const TASK_DONE_END_GAIN = 0.001;
export const TASK_DONE_TONE_SEC = 0.35;

// notifikasi task gagal / alert (failed): dua nada peringatan A4-Eb4 (tritone halus)
export const TASK_FAIL_FREQS = [440.0, 311.13];
export const TASK_FAIL_DELAY_SEC = 0.14;
export const TASK_FAIL_GAIN = 0.035;
export const TASK_FAIL_END_GAIN = 0.001;
export const TASK_FAIL_TONE_SEC = 0.30;

// nada blip klik/seleksi agent (interaksi 3D): C6 singkat & lembut
export const SELECT_FREQ = 1046.50;
export const SELECT_GAIN = 0.015;
export const SELECT_END_GAIN = 0.0005;
export const SELECT_SEC = 0.04;

// volume master: persist di localStorage 'wfs_audio_volume' (default 1.0)
export const VOLUME_KEY = 'wfs_audio_volume';
export const DEFAULT_VOLUME = 1.0;
export const VOLUME_PRESETS = [0.25, 0.50, 0.80, 1.00];
export const VOLUME_PRESET_LABELS = {
  0.25: '25% Lembut',
  0.50: '50% Sedang',
  0.80: '80% Optimal',
  1.00: '100% Penuh',
};

export function clampVolume(v) {
  if (!Number.isFinite(v)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
}

export function loadAudioVolume(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return DEFAULT_VOLUME;
  try {
    const raw = storage.getItem(VOLUME_KEY);
    if (raw === null || raw === undefined) return DEFAULT_VOLUME;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? clampVolume(v) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function saveAudioVolume(storage = (typeof localStorage !== 'undefined' ? localStorage : null), v = DEFAULT_VOLUME) {
  if (!storage) return false;
  try {
    const clamped = clampVolume(v);
    storage.setItem(VOLUME_KEY, String(clamped));
    return true;
  } catch {
    return false;
  }
}

export function formatVolumePercent(v) {
  return `${Math.round(clampVolume(v) * 100)}%`;
}

export function keyclickFreq(rng) {
  return KEYCLICK_BASE_FREQ + rng() * KEYCLICK_JITTER;
}

// envelope decay per sampel i dari buffer panjang n (white-noise langkah)
export function stepEnvelope(i, n) {
  return Math.exp(-i / n * STEP_DECAY);
}

// waktu mulai nada chime ke-i (detik sejak trigger)
export function chimeStart(i) {
  return i * CHIME_DELAY_SEC;
}

// waktu mulai nada task done ke-i (detik sejak trigger)
export function taskDoneStart(i) {
  return i * TASK_DONE_DELAY_SEC;
}

// waktu mulai nada task fail ke-i (detik sejak trigger)
export function taskFailStart(i) {
  return i * TASK_FAIL_DELAY_SEC;
}

// nilai gain master: 0 bila muted, sebanding volume bila tidak (clamp 0..1)
export function masterGainValue(muted, volume = DEFAULT_VOLUME) {
  if (muted) return 0;
  return clampVolume(volume);
}

// Pengatur waktu suara periodik (diekstrak dari animate() OfficeScene):
// timer dikurangi delta; saat habis → trigger sekali + interval baru.
// Murni (tanpa side effect) agar mudah diuji unit. interval bisa angka
// (step: .32) atau fungsi rng→detik (keyclick: .09 + rng()*.18).
export function tickSoundTimer(prev, delta, interval, rng = Math.random) {
  if (!Number.isFinite(prev) || !Number.isFinite(delta)) return { trigger: true, timer: 0 };
  const nt = prev - delta;
  if (nt > 0) return { trigger: false, timer: nt };
  return { trigger: true, timer: typeof interval === 'function' ? interval(rng) : interval };
}
