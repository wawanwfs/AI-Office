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

// notifikasi task prioritas / urgent alert: dua nada cerah & tajam A5 (880 Hz) - D6 (1174.66 Hz)
export const TASK_URGENT_FREQS = [880.0, 1174.66];
export const TASK_URGENT_DELAY_SEC = 0.08;
export const TASK_URGENT_GAIN = 0.035;
export const TASK_URGENT_END_GAIN = 0.001;
export const TASK_URGENT_TONE_SEC = 0.18;

// nada blip klik/seleksi agent (interaksi 3D): C6 singkat & lembut
export const SELECT_FREQ = 1046.50;
export const SELECT_GAIN = 0.015;
export const SELECT_END_GAIN = 0.0005;
export const SELECT_SEC = 0.04;

// nada interaksi kartu kanban (drag & drop tactile feedback)
// pickup / drag start: nada meluncur naik (chirp) lembut
export const CARD_PICKUP_FREQ_START = 340;
export const CARD_PICKUP_FREQ_END = 520;
export const CARD_PICKUP_GAIN = 0.018;
export const CARD_PICKUP_END_GAIN = 0.0005;
export const CARD_PICKUP_SEC = 0.045;

// drop / drop slot snap: nada meluncur turun (snap thud) lembut
export const CARD_DROP_FREQ_START = 420;
export const CARD_DROP_FREQ_END = 210;
export const CARD_DROP_GAIN = 0.022;
export const CARD_DROP_END_GAIN = 0.0005;
export const CARD_DROP_SEC = 0.055;

export function calcCardSweepFreq(startFreq, endFreq, ratio = 0) {
  if (!Number.isFinite(startFreq) || startFreq <= 0) return 400;
  if (!Number.isFinite(endFreq) || endFreq <= 0) return startFreq;
  const r = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return Math.round(startFreq * Math.pow(endFreq / startFreq, r));
}

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

// ambience ruangan kantor (Web Audio ambient room hum / HVAC tone)
export const AMBIENCE_KEY = 'wfs_audio_ambience';
export const AMBIENCE_VOL_KEY = 'wfs_audio_ambience_volume';
export const DEFAULT_AMBIENCE_ENABLED = false;
export const DEFAULT_AMBIENCE_VOLUME = 0.35;
export const AMBIENCE_BASE_FREQ = 55.0; // nada fundamental A1 (hum server / listrik kantor)
export const AMBIENCE_OVERTONE_FREQ = 110.0; // harmonik A2 lembut
export const AMBIENCE_FILTER_FREQ = 180; // filter lowpass default Hz (desir pendingin HVAC)
export const AMBIENCE_FILTER_Q = 1.0; // resonansi filter
export const AMBIENCE_FILTER_FREQ_MIN = 120; // batas bawah cutoff filter saat volume rendah
export const AMBIENCE_FILTER_FREQ_MAX = 255; // batas atas cutoff filter saat volume penuh
export const AMBIENCE_BASE_GAIN = 0.015; // gain plafon master ambience
export const AMBIENCE_RAMP_SEC = 0.4; // durasi crossfade transisi halus
export const AMBIENCE_PREVIEW_SEC = 2.5; // durasi preview uji sampel audio
export const AMBIENCE_PRESETS = [0.20, 0.40, 0.70, 1.00];
export const AMBIENCE_PRESET_LABELS = {
  0.20: '20% Halus',
  0.40: '40% Nyaman',
  0.70: '70% Jelas',
  1.00: '100% Penuh',
};

export function calcAmbienceFilterFreq(ambienceVol = DEFAULT_AMBIENCE_VOLUME) {
  const vol = clampAmbienceVolume(ambienceVol);
  // Volume default 0.35 menghasilkan tepat 180 Hz (140 + 0.35 * 115 = 180.25 -> round 180)
  return Math.round(140 + vol * 115);
}

export function clampAmbienceVolume(v) {
  if (!Number.isFinite(v)) return DEFAULT_AMBIENCE_VOLUME;
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
}

export function loadAmbienceEnabled(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return DEFAULT_AMBIENCE_ENABLED;
  try {
    const raw = storage.getItem(AMBIENCE_KEY);
    if (raw === null || raw === undefined) return DEFAULT_AMBIENCE_ENABLED;
    return raw === '1' || raw === 'true';
  } catch {
    return DEFAULT_AMBIENCE_ENABLED;
  }
}

export function saveAmbienceEnabled(storage = (typeof localStorage !== 'undefined' ? localStorage : null), enabled = false) {
  if (!storage) return false;
  try {
    storage.setItem(AMBIENCE_KEY, enabled ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

export function loadAmbienceVolume(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return DEFAULT_AMBIENCE_VOLUME;
  try {
    const raw = storage.getItem(AMBIENCE_VOL_KEY);
    if (raw === null || raw === undefined) return DEFAULT_AMBIENCE_VOLUME;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? clampAmbienceVolume(v) : DEFAULT_AMBIENCE_VOLUME;
  } catch {
    return DEFAULT_AMBIENCE_VOLUME;
  }
}

export function saveAmbienceVolume(storage = (typeof localStorage !== 'undefined' ? localStorage : null), v = DEFAULT_AMBIENCE_VOLUME) {
  if (!storage) return false;
  try {
    const clamped = clampAmbienceVolume(v);
    storage.setItem(AMBIENCE_VOL_KEY, String(clamped));
    return true;
  } catch {
    return false;
  }
}

export function formatAmbiencePercent(v) {
  return `${Math.round(clampAmbienceVolume(v) * 100)}%`;
}

export function calcAmbienceGain(masterVol = DEFAULT_VOLUME, ambienceVol = DEFAULT_AMBIENCE_VOLUME, muted = false, enabled = true) {
  if (muted || !enabled) return 0;
  return clampVolume(masterVol) * clampAmbienceVolume(ambienceVol) * AMBIENCE_BASE_GAIN;
}

export function getNextAmbiencePreset(currentVol = DEFAULT_AMBIENCE_VOLUME, presets = AMBIENCE_PRESETS) {
  if (!Array.isArray(presets) || !presets.length) return DEFAULT_AMBIENCE_VOLUME;
  const clamped = clampAmbienceVolume(currentVol);
  const found = presets.find((p) => p > clamped + 0.01);
  return found !== undefined ? found : presets[0];
}

export function getAmbienceStatusLabel({ enabled = false, muted = false, volume = DEFAULT_AMBIENCE_VOLUME } = {}) {
  if (muted) return 'Mute';
  if (!enabled) return 'Hum Off';
  return `Hum ${formatAmbiencePercent(volume)}`;
}

export function getAmbienceTooltip({ enabled = false, muted = false, volume = DEFAULT_AMBIENCE_VOLUME } = {}) {
  if (muted) {
    return 'Suara kantor dibisukan — Klik atau tekan A untuk aktifkan/unmute, Klik kanan untuk pengaturan audio';
  }
  if (!enabled) {
    return 'Ambience Hum Kantor Nonaktif (Shortcut A) — Klik untuk nyalakan desir AC/server kantor, Klik kanan untuk atur';
  }
  return `Ambience Hum Kantor Aktif (${formatAmbiencePercent(volume)}) (Shortcut A / Shift+A) — Klik untuk matikan, Shift+Klik untuk siklus volume, Klik kanan untuk atur`;
}

export function getAmbienceAriaLabel({ enabled = false, muted = false, volume = DEFAULT_AMBIENCE_VOLUME } = {}) {
  if (muted) {
    return 'Ambience ruangan terbungkam karena master audio mute';
  }
  if (!enabled) {
    return 'Ambience hum kantor nonaktif';
  }
  return `Ambience hum kantor aktif ${formatAmbiencePercent(volume)}`;
}

// Algoritma filter Paul Kellet untuk pink noise (1/f) bermutu tinggi
// Menghasilkan data audio float (-1..1) untuk desir ruangan kantor / HVAC
export function generatePinkNoiseData(samples, rng = Math.random) {
  const len = Math.max(1, Math.floor(samples));
  const data = new Float32Array(len);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = rng() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return data;
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

// waktu mulai nada task urgent ke-i (detik sejak trigger)
export function taskUrgentStart(i) {
  return i * TASK_URGENT_DELAY_SEC;
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
