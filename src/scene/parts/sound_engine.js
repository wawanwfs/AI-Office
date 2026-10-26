// Sound engine runtime — diekstrak dari OfficeScene.js agar bisa diuji unit.
// Tidak ada dependency THREE; Web Audio diakses lewat ctx yang di-inject
// (di produksi: AudioContext asli; di test: stub tercatat).
import {
  keyclickFreq, stepEnvelope, chimeStart, taskDoneStart, taskFailStart, taskUrgentStart, masterGainValue,
  KEYCLICK_BASE_FREQ, KEYCLICK_JITTER, KEYCLICK_GAIN, KEYCLICK_END_GAIN, KEYCLICK_SEC,
  STEP_GAIN, STEP_SEC, CHIME_FREQS, CHIME_DELAY_SEC, CHIME_GAIN, CHIME_END_GAIN, CHIME_TONE_SEC,
  TASK_DONE_FREQS, TASK_DONE_GAIN, TASK_DONE_END_GAIN, TASK_DONE_TONE_SEC,
  TASK_FAIL_FREQS, TASK_FAIL_GAIN, TASK_FAIL_END_GAIN, TASK_FAIL_TONE_SEC,
  TASK_URGENT_FREQS, TASK_URGENT_GAIN, TASK_URGENT_END_GAIN, TASK_URGENT_TONE_SEC,
  SELECT_FREQ, SELECT_GAIN, SELECT_END_GAIN, SELECT_SEC, DEFAULT_VOLUME,
} from './sound_spec.js';

const noop = () => {};
const noCtx = { state: 'none', close: noop };

export function createSoundEngine({ ctxFactory, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, initialVolume = DEFAULT_VOLUME }) {
  let ctx = noCtx;
  let masterGain = null;
  let started = false;
  let muted = false;
  let volume = initialVolume;
  const pending = [];
  const calls = { key: 0, step: 0, chime: 0, taskDone: 0, taskFail: 0, select: 0, taskUrgent: 0 };

  const dbg = (sink) => {
    const snap = { started, state: ctx === noCtx ? 'none' : ctx.state, calls: { ...calls }, muted, volume };
    if (sink) sink(snap);
    return snap;
  };

  function ensure() {
    if (started) return;
    started = true;
    ctx = ctxFactory();
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(noop);
    masterGain = ctx.createGain();
    masterGain.gain.value = masterGainValue(muted, volume);
    masterGain.connect(ctx.destination);
    dbg();
  }

  function ensureLive() {
    if (ctx === noCtx) return false;
    try {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(noop);
    } catch { /* no-op */ }
    return true;
  }

  function playKeyClick(rng = Math.random) {
    ensure(); calls.key++; dbg();
    if (!ensureLive()) return;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = keyclickFreq(rng);
    const g = ctx.createGain();
    g.gain.value = KEYCLICK_GAIN;
    g.gain.exponentialRampToValueAtTime(KEYCLICK_END_GAIN, ctx.currentTime + KEYCLICK_SEC);
    osc.connect(g); g.connect(masterGain);
    osc.start(); osc.stop(ctx.currentTime + KEYCLICK_SEC);
  }

  function playStep() {
    ensure(); calls.step++; dbg();
    if (!ensureLive()) return;
    const len = Math.floor(ctx.sampleRate * STEP_SEC);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * stepEnvelope(i, data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = STEP_GAIN;
    src.connect(g); g.connect(masterGain);
    src.start();
  }

  function playMeetingChime() {
    ensure(); calls.chime++; dbg();
    if (!ensureLive()) return;
    CHIME_FREQS.forEach((freq, i) => {
      const t = setTimeoutFn(() => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = CHIME_GAIN;
        g.gain.exponentialRampToValueAtTime(CHIME_END_GAIN, ctx.currentTime + CHIME_TONE_SEC);
        osc.connect(g); g.connect(masterGain);
        osc.start(); osc.stop(ctx.currentTime + CHIME_TONE_SEC);
        const ix = pending.indexOf(t); if (ix >= 0) pending.splice(ix, 1);
      }, chimeStart(i));
      pending.push(t);
    });
  }

  function playTaskDone() {
    ensure(); calls.taskDone++; dbg();
    if (!ensureLive()) return;
    TASK_DONE_FREQS.forEach((freq, i) => {
      const t = setTimeoutFn(() => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = TASK_DONE_GAIN;
        g.gain.exponentialRampToValueAtTime(TASK_DONE_END_GAIN, ctx.currentTime + TASK_DONE_TONE_SEC);
        osc.connect(g); g.connect(masterGain);
        osc.start(); osc.stop(ctx.currentTime + TASK_DONE_TONE_SEC);
        const ix = pending.indexOf(t); if (ix >= 0) pending.splice(ix, 1);
      }, taskDoneStart(i));
      pending.push(t);
    });
  }

  function playTaskFail() {
    ensure(); calls.taskFail++; dbg();
    if (!ensureLive()) return;
    TASK_FAIL_FREQS.forEach((freq, i) => {
      const t = setTimeoutFn(() => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = TASK_FAIL_GAIN;
        g.gain.exponentialRampToValueAtTime(TASK_FAIL_END_GAIN, ctx.currentTime + TASK_FAIL_TONE_SEC);
        osc.connect(g); g.connect(masterGain);
        osc.start(); osc.stop(ctx.currentTime + TASK_FAIL_TONE_SEC);
        const ix = pending.indexOf(t); if (ix >= 0) pending.splice(ix, 1);
      }, taskFailStart(i));
      pending.push(t);
    });
  }

  function playSelect() {
    ensure(); calls.select++; dbg();
    if (!ensureLive()) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = SELECT_FREQ;
    const g = ctx.createGain();
    g.gain.value = SELECT_GAIN;
    g.gain.exponentialRampToValueAtTime(SELECT_END_GAIN, ctx.currentTime + SELECT_SEC);
    osc.connect(g); g.connect(masterGain);
    osc.start(); osc.stop(ctx.currentTime + SELECT_SEC);
  }

  function playTaskUrgent() {
    ensure(); calls.taskUrgent++; dbg();
    if (!ensureLive()) return;
    TASK_URGENT_FREQS.forEach((freq, i) => {
      const t = setTimeoutFn(() => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = TASK_URGENT_GAIN;
        g.gain.exponentialRampToValueAtTime(TASK_URGENT_END_GAIN, ctx.currentTime + TASK_URGENT_TONE_SEC);
        osc.connect(g); g.connect(masterGain);
        osc.start(); osc.stop(ctx.currentTime + TASK_URGENT_TONE_SEC);
        const ix = pending.indexOf(t); if (ix >= 0) pending.splice(ix, 1);
      }, taskUrgentStart(i));
      pending.push(t);
    });
  }

  function setMuted(v) {
    muted = !!v;
    if (masterGain) masterGain.gain.value = masterGainValue(muted, volume);
    dbg();
  }

  function setVolume(v) {
    volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_VOLUME;
    if (masterGain) masterGain.gain.value = masterGainValue(muted, volume);
    dbg();
  }

  function dispose() {
    pending.forEach(clearTimeoutFn);
    pending.length = 0;
    try { if (ctx !== noCtx) ctx.close(); } catch { /* no-op */ }
    ctx = noCtx;
    masterGain = null;
    started = false;
    dbg();
  }

  function rawCtx() { return ctx === noCtx ? null : ctx; }
  function state() { return ctx === noCtx ? 'none' : ctx.state; }
  function suspend() { if (ctx !== noCtx) ctx.suspend(); }
  function resume() { if (ctx !== noCtx && ctx.state === 'suspended') ctx.resume(); }

  return {
    ensure, playKeyClick, playStep, playMeetingChime, playTaskDone, playTaskFail, playTaskUrgent, playSelect,
    setMuted, setVolume, getVolume: () => volume, dispose, dbg,
    rawCtx, state, suspend, resume,
    isMuted: () => muted,
    masterGainValue: () => (masterGain ? masterGain.gain.value : masterGainValue(muted, volume)),
    isStarted: () => started,
  };
}
