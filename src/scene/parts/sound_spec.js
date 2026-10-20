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

// nilai gain master: 0 bila muted, 1 bila tidak
export function masterGainValue(muted) {
  return muted ? 0 : 1;
}
