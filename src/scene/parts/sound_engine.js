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
  CARD_PICKUP_FREQ_START, CARD_PICKUP_FREQ_END, CARD_PICKUP_GAIN, CARD_PICKUP_END_GAIN, CARD_PICKUP_SEC,
  CARD_DROP_FREQ_START, CARD_DROP_FREQ_END, CARD_DROP_GAIN, CARD_DROP_END_GAIN, CARD_DROP_SEC,
  DEFAULT_AMBIENCE_ENABLED, DEFAULT_AMBIENCE_VOLUME, AMBIENCE_BASE_FREQ, AMBIENCE_OVERTONE_FREQ,
  AMBIENCE_FILTER_FREQ, AMBIENCE_FILTER_Q, AMBIENCE_RAMP_SEC, AMBIENCE_PREVIEW_SEC,
  clampAmbienceVolume, calcAmbienceGain, calcAmbienceFilterFreq, generatePinkNoiseData,
} from './sound_spec.js';

const noop = () => {};
const noCtx = { state: 'none', close: noop };

export function createSoundEngine({
  ctxFactory,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  initialVolume = DEFAULT_VOLUME,
  initialAmbienceEnabled = DEFAULT_AMBIENCE_ENABLED,
  initialAmbienceVolume = DEFAULT_AMBIENCE_VOLUME,
}) {
  let ctx = noCtx;
  let masterGain = null;
  let started = false;
  let muted = false;
  let volume = initialVolume;
  let ambienceEnabled = !!initialAmbienceEnabled;
  let ambienceVolume = clampAmbienceVolume(initialAmbienceVolume);
  let ambienceNodes = null;
  const pending = [];
  const calls = { key: 0, step: 0, chime: 0, taskDone: 0, taskFail: 0, select: 0, taskUrgent: 0, cardPickup: 0, cardDrop: 0, ambience: 0 };

  const dbg = (sink) => {
    const snap = {
      started,
      state: ctx === noCtx ? 'none' : ctx.state,
      calls: { ...calls },
      muted,
      volume,
      ambienceEnabled,
      ambienceVolume,
      isAmbienceActive: !!(ambienceNodes && (!muted && (ambienceEnabled || (ambienceNodes && ambienceNodes.previewTimer)))),
    };
    if (sink) sink(snap);
    return snap;
  };

  function syncAmbience(rampSec = AMBIENCE_RAMP_SEC) {
    if (!ambienceNodes || !ambienceNodes.gain || ctx === noCtx) return;
    const isPreviewing = !!(ambienceNodes && ambienceNodes.previewTimer);
    const target = calcAmbienceGain(volume, ambienceVolume, muted, isPreviewing || ambienceEnabled);
    const curTime = ctx.currentTime || 0;
    try {
      if (ambienceNodes.gain.gain.linearRampToValueAtTime) {
        if (ambienceNodes.gain.gain.setValueAtTime) {
          ambienceNodes.gain.gain.setValueAtTime(ambienceNodes.gain.gain.value, curTime);
        }
        ambienceNodes.gain.gain.linearRampToValueAtTime(target, curTime + rampSec);
      } else {
        ambienceNodes.gain.gain.value = target;
      }
    } catch {
      if (ambienceNodes.gain.gain) ambienceNodes.gain.gain.value = target;
    }

    if (ambienceNodes.filter && ambienceNodes.filter.frequency) {
      const targetFreq = calcAmbienceFilterFreq(ambienceVolume);
      try {
        if (ambienceNodes.filter.frequency.linearRampToValueAtTime) {
          if (ambienceNodes.filter.frequency.setValueAtTime) {
            ambienceNodes.filter.frequency.setValueAtTime(ambienceNodes.filter.frequency.value, curTime);
          }
          ambienceNodes.filter.frequency.linearRampToValueAtTime(targetFreq, curTime + rampSec);
        } else {
          ambienceNodes.filter.frequency.value = targetFreq;
        }
      } catch {
        if (ambienceNodes.filter.frequency) ambienceNodes.filter.frequency.value = targetFreq;
      }
    }
  }

  function cleanupAmbienceNodes(nodes) {
    if (!nodes) return;
    try { if (nodes.osc1 && nodes.osc1.stop) nodes.osc1.stop(); } catch { /* noop */ }
    try { if (nodes.osc2 && nodes.osc2.stop) nodes.osc2.stop(); } catch { /* noop */ }
    try { if (nodes.noiseSrc && nodes.noiseSrc.stop) nodes.noiseSrc.stop(); } catch { /* noop */ }
    try { if (nodes.gain && nodes.gain.disconnect) nodes.gain.disconnect(); } catch { /* noop */ }
  }

  function startAmbienceNodes() {
    if (ambienceNodes || ctx === noCtx) return;
    try {
      const ambGain = ctx.createGain();
      const initialGain = calcAmbienceGain(volume, ambienceVolume, muted, ambienceEnabled);
      ambGain.gain.value = 0;
      ambGain.connect(masterGain);

      // 1. Hum fundamental (55 Hz)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = AMBIENCE_BASE_FREQ;
      const osc1Gain = ctx.createGain();
      osc1Gain.gain.value = 0.5;
      osc1.connect(osc1Gain);
      osc1Gain.connect(ambGain);

      // 2. Harmonic overtone (110 Hz)
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = AMBIENCE_OVERTONE_FREQ;
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.value = 0.25;
      osc2.connect(osc2Gain);
      osc2Gain.connect(ambGain);

      // 3. Pink noise airflow (HVAC presence)
      const sampleRate = ctx.sampleRate || 48000;
      const bufLen = Math.floor(sampleRate * 2.0);
      const pinkData = generatePinkNoiseData(bufLen);
      const noiseBuf = ctx.createBuffer(1, bufLen, sampleRate);
      if (noiseBuf.copyToChannel) {
        noiseBuf.copyToChannel(pinkData, 0);
      } else if (noiseBuf.getChannelData) {
        const ch = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) ch[i] = pinkData[i];
      }

      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      let filter = null;
      if (ctx.createBiquadFilter) {
        filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = calcAmbienceFilterFreq(ambienceVolume);
        if (filter.Q) filter.Q.value = AMBIENCE_FILTER_Q;
      }

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.45;

      if (filter) {
        noiseSrc.connect(filter);
        filter.connect(noiseGain);
      } else {
        noiseSrc.connect(noiseGain);
      }
      noiseGain.connect(ambGain);

      osc1.start();
      osc2.start();
      noiseSrc.start();

      ambienceNodes = {
        gain: ambGain,
        osc1,
        osc2,
        noiseSrc,
        filter,
        noiseGain,
        previewTimer: null,
      };

      const curTime = ctx.currentTime || 0;
      if (ambGain.gain.linearRampToValueAtTime) {
        if (ambGain.gain.setValueAtTime) {
          ambGain.gain.setValueAtTime(0, curTime);
        }
        ambGain.gain.linearRampToValueAtTime(initialGain, curTime + AMBIENCE_RAMP_SEC);
      } else {
        ambGain.gain.value = initialGain;
      }
      calls.ambience++;
    } catch {
      /* abaikan error Web Audio jika lingkungan tidak mendukung */
    }
  }

  function stopAmbienceNodes(immediate = false) {
    if (!ambienceNodes) return;
    const nodes = ambienceNodes;
    ambienceNodes = null;
    if (nodes.previewTimer) {
      clearTimeoutFn(nodes.previewTimer);
      nodes.previewTimer = null;
    }

    if (!immediate && nodes.gain && nodes.gain.gain && nodes.gain.gain.linearRampToValueAtTime) {
      const curTime = (ctx && ctx.currentTime) || 0;
      try {
        if (nodes.gain.gain.setValueAtTime) {
          nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, curTime);
        }
        nodes.gain.gain.linearRampToValueAtTime(0.0001, curTime + AMBIENCE_RAMP_SEC);
      } catch { /* noop */ }
      setTimeoutFn(() => {
        cleanupAmbienceNodes(nodes);
      }, Math.floor(AMBIENCE_RAMP_SEC * 1000));
    } else {
      cleanupAmbienceNodes(nodes);
    }
  }

  function setAmbienceEnabled(v) {
    ambienceEnabled = !!v;
    ensure();
    if (ambienceEnabled) {
      if (!ambienceNodes) {
        startAmbienceNodes();
      } else {
        syncAmbience();
      }
    } else {
      if (ambienceNodes && !ambienceNodes.previewTimer) {
        stopAmbienceNodes(false);
      } else {
        syncAmbience();
      }
    }
    dbg();
  }

  function setAmbienceVolume(v) {
    ambienceVolume = clampAmbienceVolume(v);
    syncAmbience();
    dbg();
  }

  function previewAmbience(durationSec = AMBIENCE_PREVIEW_SEC) {
    ensure();
    if (!ensureLive() || muted) return false;

    if (ambienceNodes && ambienceEnabled) {
      calls.ambience++;
      const curTime = ctx.currentTime || 0;
      const baseTarget = calcAmbienceGain(volume, ambienceVolume, muted, true);
      const swellTarget = Math.min(1.0, baseTarget * 1.6);
      try {
        if (ambienceNodes.gain.gain.linearRampToValueAtTime) {
          if (ambienceNodes.gain.gain.setValueAtTime) {
            ambienceNodes.gain.gain.setValueAtTime(ambienceNodes.gain.gain.value, curTime);
          }
          ambienceNodes.gain.gain.linearRampToValueAtTime(swellTarget, curTime + 0.3);
          ambienceNodes.gain.gain.linearRampToValueAtTime(baseTarget, curTime + durationSec);
        }
      } catch { /* noop */ }
      dbg();
      return true;
    }

    startAmbienceNodes();
    if (!ambienceNodes) return false;

    const targetGain = calcAmbienceGain(volume, ambienceVolume, false, true);
    const curTime = ctx.currentTime || 0;
    try {
      if (ambienceNodes.gain.gain.linearRampToValueAtTime) {
        if (ambienceNodes.gain.gain.setValueAtTime) {
          ambienceNodes.gain.gain.setValueAtTime(0, curTime);
        }
        ambienceNodes.gain.gain.linearRampToValueAtTime(targetGain, curTime + AMBIENCE_RAMP_SEC);
      } else {
        ambienceNodes.gain.gain.value = targetGain;
      }
    } catch { /* noop */ }

    const timer = setTimeoutFn(() => {
      if (ambienceNodes) {
        ambienceNodes.previewTimer = null;
        if (!ambienceEnabled) {
          stopAmbienceNodes(false);
        }
      }
    }, Math.max(100, Math.floor(durationSec * 1000)));

    ambienceNodes.previewTimer = timer;
    dbg();
    return true;
  }

  function ensure() {
    if (started) return;
    started = true;
    ctx = ctxFactory();
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(noop);
    masterGain = ctx.createGain();
    masterGain.gain.value = masterGainValue(muted, volume);
    masterGain.connect(ctx.destination);
    if (ambienceEnabled && !ambienceNodes) {
      startAmbienceNodes();
    }
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

  function playCardPickup() {
    ensure(); calls.cardPickup++; dbg();
    if (!ensureLive()) return;
    const curTime = ctx.currentTime || 0;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    if (osc.frequency && osc.frequency.setValueAtTime && osc.frequency.exponentialRampToValueAtTime) {
      osc.frequency.setValueAtTime(CARD_PICKUP_FREQ_START, curTime);
      osc.frequency.exponentialRampToValueAtTime(CARD_PICKUP_FREQ_END, curTime + CARD_PICKUP_SEC);
    } else if (osc.frequency) {
      osc.frequency.value = CARD_PICKUP_FREQ_START;
    }
    const g = ctx.createGain();
    g.gain.value = CARD_PICKUP_GAIN;
    if (g.gain && g.gain.exponentialRampToValueAtTime) {
      g.gain.exponentialRampToValueAtTime(CARD_PICKUP_END_GAIN, curTime + CARD_PICKUP_SEC);
    }
    osc.connect(g); g.connect(masterGain);
    osc.start(); osc.stop(curTime + CARD_PICKUP_SEC);
  }

  function playCardDrop() {
    ensure(); calls.cardDrop++; dbg();
    if (!ensureLive()) return;
    const curTime = ctx.currentTime || 0;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    if (osc.frequency && osc.frequency.setValueAtTime && osc.frequency.exponentialRampToValueAtTime) {
      osc.frequency.setValueAtTime(CARD_DROP_FREQ_START, curTime);
      osc.frequency.exponentialRampToValueAtTime(CARD_DROP_FREQ_END, curTime + CARD_DROP_SEC);
    } else if (osc.frequency) {
      osc.frequency.value = CARD_DROP_FREQ_START;
    }
    const g = ctx.createGain();
    g.gain.value = CARD_DROP_GAIN;
    if (g.gain && g.gain.exponentialRampToValueAtTime) {
      g.gain.exponentialRampToValueAtTime(CARD_DROP_END_GAIN, curTime + CARD_DROP_SEC);
    }
    osc.connect(g); g.connect(masterGain);
    osc.start(); osc.stop(curTime + CARD_DROP_SEC);
  }

  function setMuted(v) {
    muted = !!v;
    if (masterGain) masterGain.gain.value = masterGainValue(muted, volume);
    syncAmbience();
    dbg();
  }

  function setVolume(v) {
    volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_VOLUME;
    if (masterGain) masterGain.gain.value = masterGainValue(muted, volume);
    syncAmbience();
    dbg();
  }

  function dispose() {
    stopAmbienceNodes(true);
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
    playCardPickup, playCardDrop,
    previewAmbience, startAmbience: () => setAmbienceEnabled(true), stopAmbience: () => setAmbienceEnabled(false),
    setAmbienceEnabled, isAmbienceEnabled: () => ambienceEnabled,
    setAmbienceVolume, getAmbienceVolume: () => ambienceVolume,
    isAmbienceActive: () => !!(ambienceNodes && (!muted && (ambienceEnabled || (ambienceNodes && ambienceNodes.previewTimer)))),
    setMuted, setVolume, getVolume: () => volume, dispose, dbg,
    rawCtx, state, suspend, resume,
    isMuted: () => muted,
    masterGainValue: () => (masterGain ? masterGain.gain.value : masterGainValue(muted, volume)),
    isStarted: () => started,
  };
}
