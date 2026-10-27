// Unit test runtime sound engine (src/scene/parts/sound_engine.js).
// Web Audio distub penuh agar semua jalur (ensure/keyclick/step/chime/mute/dispose)
// terverifikasi tanpa browser asli — regresi "suara senyap" (gain/mute/envelope salah) terdeteksi.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSoundEngine } from '../scene/parts/sound_engine.js';
import {
  KEYCLICK_BASE_FREQ, KEYCLICK_JITTER, KEYCLICK_GAIN, KEYCLICK_END_GAIN, KEYCLICK_SEC,
  STEP_GAIN, STEP_SEC, CHIME_FREQS, CHIME_DELAY_SEC, CHIME_GAIN, CHIME_END_GAIN, CHIME_TONE_SEC,
  TASK_DONE_FREQS, TASK_DONE_DELAY_SEC, TASK_DONE_GAIN, TASK_DONE_END_GAIN, TASK_DONE_TONE_SEC,
  TASK_FAIL_FREQS, TASK_FAIL_DELAY_SEC, TASK_FAIL_GAIN, TASK_FAIL_END_GAIN, TASK_FAIL_TONE_SEC,
  TASK_URGENT_FREQS, TASK_URGENT_GAIN, TASK_URGENT_END_GAIN, TASK_URGENT_TONE_SEC,
  SELECT_FREQ, SELECT_GAIN, SELECT_END_GAIN, SELECT_SEC, DEFAULT_VOLUME,
  CARD_PICKUP_FREQ_START, CARD_PICKUP_FREQ_END, CARD_PICKUP_GAIN, CARD_PICKUP_END_GAIN, CARD_PICKUP_SEC,
  CARD_DROP_FREQ_START, CARD_DROP_FREQ_END, CARD_DROP_GAIN, CARD_DROP_END_GAIN, CARD_DROP_SEC,
  keyclickFreq, stepEnvelope,
} from '../scene/parts/sound_spec.js';

function makeCtx(state = 'running') {
  const log = { osc: [], buffers: [], gains: [], filters: [] };
  let st = state;
  const ctx = {
    get state() { return st; },
    currentTime: 0,
    sampleRate: 48000,
    destination: { id: 'dest' },
    resume: vi.fn(async () => { st = 'running'; }),
    suspend: vi.fn(async () => { st = 'suspended'; }),
    close: vi.fn(async () => { st = 'closed'; }),
    createGain: () => {
      const g = {
        gain: {
          value: 0,
          ramps: [],
          linearRamps: [],
          setValueAtTime: vi.fn(function(v) { this.value = v; }),
          linearRampToValueAtTime(v, t) { this.linearRamps.push([v, t]); },
          exponentialRampToValueAtTime(v, t) { this.ramps.push([v, t]); }
        },
        connectedTo: null,
        connect(t) { this.connectedTo = t; },
        disconnect: vi.fn()
      };
      log.gains.push(g);
      return g;
    },
    createOscillator: () => {
      const o = {
        type: '',
        frequency: {
          value: 0,
          ramps: [],
          setValueAtTime: vi.fn(function(v) { this.value = v; }),
          exponentialRampToValueAtTime: vi.fn(function(v, t) { this.ramps.push([v, t]); this.value = v; }),
        },
        connectedTo: null,
        started: false,
        stoppedAt: null,
        connect(t) { this.connectedTo = t; },
        start() { this.started = true; },
        stop(t) { this.stoppedAt = t ?? ctx.currentTime; }
      };
      log.osc.push(o);
      return o;
    },
    createBuffer: (ch, len, rate) => ({
      length: len,
      sampleRate: rate,
      numberOfChannels: ch,
      getChannelData: () => new Float32Array(len),
      copyToChannel: vi.fn()
    }),
    createBufferSource: () => {
      const s = {
        buffer: null,
        connectedTo: null,
        started: false,
        loop: false,
        stoppedAt: null,
        connect(t) { this.connectedTo = t; },
        start() { this.started = true; },
        stop(t) { this.stoppedAt = t ?? ctx.currentTime; },
        disconnect: vi.fn()
      };
      log.buffers.push(s);
      return s;
    },
    createBiquadFilter: () => {
      const f = {
        type: '',
        frequency: { value: 0 },
        Q: { value: 0 },
        connectedTo: null,
        connect(t) { this.connectedTo = t; },
        disconnect: vi.fn()
      };
      log.filters.push(f);
      return f;
    }
  };
  ctx.__log = log;
  return ctx;
}

function makeEngine(ctxState = 'running') {
  const ctx = makeCtx(ctxState);
  const timeouts = [];
  const eng = createSoundEngine({
    ctxFactory: () => ctx,
    setTimeoutFn: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length - 1; },
    clearTimeoutFn: (id) => { timeouts[id] = null; },
  });
  return { eng, ctx, timeouts };
}

const gainChain = (node) => { // osc/src → gain → master → destination
  const g = node.connectedTo;
  return { g, master: g && g.connectedTo };
};

beforeEach(() => { vi.restoreAllMocks(); });

describe('sound engine runtime', () => {
  it('lazy: sebelum interaksi belum started, state none, __audio.debug terekspose', () => {
    const { eng } = makeEngine();
    const snap = eng.dbg();
    expect(snap.started).toBe(false);
    expect(snap.state).toBe('none');
    expect(snap.calls).toEqual({ key: 0, step: 0, chime: 0, taskDone: 0, taskFail: 0, select: 0, taskUrgent: 0, cardPickup: 0, cardDrop: 0, ambience: 0 });
    expect(snap.volume).toBe(DEFAULT_VOLUME);
    expect(eng.isMuted()).toBe(false);
  });

  it('ensure: membuat ctx, resume bila suspended, masterGain 1 tersambung ke destination', () => {
    const { eng, ctx } = makeEngine('suspended');
    eng.ensure();
    expect(eng.isStarted()).toBe(true);
    expect(ctx.resume).toHaveBeenCalled();
    const snap = eng.dbg();
    expect(snap.state).toBe('running');
  });

  it('playKeyClick: osc square freq sesuai rng, gain ramp 0.01→0.001, stop tepat KEYCLICK_SEC', () => {
    const { eng, ctx } = makeEngine();
    eng.playKeyClick(() => 0.5); // freq = 800 + 0.5*400 = 1000
    expect(ctx.__log.osc).toHaveLength(1);
    const osc = ctx.__log.osc[0];
    expect(osc.type).toBe('square');
    expect(osc.frequency.value).toBe(KEYCLICK_BASE_FREQ + 0.5 * KEYCLICK_JITTER);
    const { g } = gainChain(osc);
    expect(g.gain.value).toBe(KEYCLICK_GAIN);
    expect(g.gain.ramps[0]).toEqual([KEYCLICK_END_GAIN, ctx.currentTime + KEYCLICK_SEC]);
    expect(g.connectedTo).toBeTruthy(); // tersambung ke masterGain (bukan destination langsung)
    expect(g.connectedTo.connectedTo).toBe(ctx.destination); // g→masterGain→ctx.destination
    expect(osc.started).toBe(true);
    expect(osc.stoppedAt).toBeCloseTo(KEYCLICK_SEC, 10);
    expect(eng.dbg().calls.key).toBe(1);
  });

  it('playStep: buffer white-noise panjang sampleRate*STEP_SEC, envelope decay, gain STEP_GAIN', () => {
    const { eng, ctx } = makeEngine();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    eng.playStep();
    expect(ctx.__log.buffers).toHaveLength(1);
    const src = ctx.__log.buffers[0];
    expect(src.buffer.length).toBe(48000 * STEP_SEC);
    expect(src.buffer.sampleRate).toBe(48000);
    const { g } = gainChain(src);
    expect(g.gain.value).toBe(STEP_GAIN);
    expect(g.connectedTo.connectedTo).toBe(ctx.destination); // g→masterGain→ctx.destination
    expect(src.started).toBe(true);
    // rumus envelope konsisten dengan spec (spot-check via fungsi murni)
    expect(stepEnvelope(0, 2400)).toBe(1);
    expect(eng.dbg().calls.step).toBe(1);
  });

  it('playMeetingChime: 3 nada C5-E5-G5 terjadwal chimeStart(i), gain 0.04→0.001, sine', () => {
    const { eng, ctx, timeouts } = makeEngine();
    eng.playMeetingChime();
    expect(timeouts).toHaveLength(CHIME_FREQS.length);
    timeouts.forEach((t, i) => expect(t.ms).toBe(i * CHIME_DELAY_SEC));
    // sebelum timeout dieksekusi belum ada osc
    expect(ctx.__log.osc).toHaveLength(0);
    timeouts.forEach((t, i) => {
      t.fn();
      const osc = ctx.__log.osc[i];
      expect(osc.type).toBe('sine');
      expect(osc.frequency.value).toBe(CHIME_FREQS[i]);
      const { g } = gainChain(osc);
      expect(g.gain.value).toBe(CHIME_GAIN);
      expect(g.gain.ramps[0]).toEqual([CHIME_END_GAIN, ctx.currentTime + CHIME_TONE_SEC]);
      expect(g.connectedTo.connectedTo).toBe(ctx.destination); // g→masterGain→ctx.destination
      expect(osc.stoppedAt).toBeCloseTo(CHIME_TONE_SEC, 10);
    });
    expect(eng.dbg().calls.chime).toBe(1);
  });

  it('setMuted: masterGain 0 saat mute, kembali 1 saat unmute; dbg.muted ikut', () => {
    const { eng, ctx } = makeEngine();
    eng.ensure();
    eng.setMuted(true);
    expect(eng.dbg().muted).toBe(true);
    eng.playKeyClick(Math.random);
    const osc = ctx.__log.osc[0];
    expect(gainChain(osc).g.connectedTo.gain.value).toBe(0); // tetap bunyi tapi lewat gain 0
    eng.setMuted(false);
    expect(eng.dbg().muted).toBe(false);
    eng.playKeyClick(Math.random);
    expect(gainChain(ctx.__log.osc[1]).g.connectedTo.gain.value).toBe(1);
  });

  it('play pertama memicu ensure otomatis: node audio dibuat, chain ke masterGain', () => {
    const { eng, ctx } = makeEngine();
    expect(() => eng.playKeyClick(Math.random)).not.toThrow();
    expect(() => eng.playStep()).not.toThrow();
    expect(() => eng.playMeetingChime()).not.toThrow();
    expect(eng.dbg().calls).toEqual({ key: 1, step: 1, chime: 1, taskDone: 0, taskFail: 0, select: 0, taskUrgent: 0, cardPickup: 0, cardDrop: 0, ambience: 0 });
    expect(eng.isStarted()).toBe(true);
    const osc = ctx.__log.osc[0];
    expect(gainChain(osc).g.connectedTo.connectedTo).toBe(ctx.destination);
  });

  it('playTaskDone: 4 nada naik C5-E5-G5-C6, gain 0.04→0.001, sine', () => {
    const { eng, ctx, timeouts } = makeEngine();
    eng.playTaskDone();
    expect(timeouts).toHaveLength(TASK_DONE_FREQS.length);
    timeouts.forEach((t, i) => expect(t.ms).toBeCloseTo(i * TASK_DONE_DELAY_SEC));
    timeouts.forEach((t, i) => {
      t.fn();
      const osc = ctx.__log.osc[i];
      expect(osc.type).toBe('sine');
      expect(osc.frequency.value).toBe(TASK_DONE_FREQS[i]);
      const { g } = gainChain(osc);
      expect(g.gain.value).toBe(TASK_DONE_GAIN);
      expect(g.gain.ramps[0]).toEqual([TASK_DONE_END_GAIN, ctx.currentTime + TASK_DONE_TONE_SEC]);
      expect(g.connectedTo.connectedTo).toBe(ctx.destination);
      expect(osc.stoppedAt).toBeCloseTo(TASK_DONE_TONE_SEC, 10);
    });
    expect(eng.dbg().calls.taskDone).toBe(1);
  });

  it('playTaskFail: 2 nada peringatan A4-Eb4, gain 0.035→0.001, triangle', () => {
    const { eng, ctx, timeouts } = makeEngine();
    eng.playTaskFail();
    expect(timeouts).toHaveLength(TASK_FAIL_FREQS.length);
    timeouts.forEach((t, i) => {
      t.fn();
      const osc = ctx.__log.osc[i];
      expect(osc.type).toBe('triangle');
      expect(osc.frequency.value).toBe(TASK_FAIL_FREQS[i]);
      const { g } = gainChain(osc);
      expect(g.gain.value).toBe(TASK_FAIL_GAIN);
      expect(g.gain.ramps[0]).toEqual([TASK_FAIL_END_GAIN, ctx.currentTime + TASK_FAIL_TONE_SEC]);
      expect(g.connectedTo.connectedTo).toBe(ctx.destination);
    });
    expect(eng.dbg().calls.taskFail).toBe(1);
  });

  it('playTaskUrgent: 2 nada peringatan A5-D6, gain 0.035→0.001, triangle', () => {
    const { eng, ctx, timeouts } = makeEngine();
    eng.playTaskUrgent();
    expect(timeouts).toHaveLength(TASK_URGENT_FREQS.length);
    timeouts.forEach((t, i) => {
      t.fn();
      const osc = ctx.__log.osc[i];
      expect(osc.type).toBe('triangle');
      expect(osc.frequency.value).toBe(TASK_URGENT_FREQS[i]);
      const { g } = gainChain(osc);
      expect(g.gain.value).toBe(TASK_URGENT_GAIN);
      expect(g.gain.ramps[0]).toEqual([TASK_URGENT_END_GAIN, ctx.currentTime + TASK_URGENT_TONE_SEC]);
      expect(g.connectedTo.connectedTo).toBe(ctx.destination);
    });
    expect(eng.dbg().calls.taskUrgent).toBe(1);
  });

  it('playSelect: blip interaksi C6, sine, gain 0.015', () => {
    const { eng, ctx } = makeEngine();
    eng.playSelect();
    expect(ctx.__log.osc).toHaveLength(1);
    const osc = ctx.__log.osc[0];
    expect(osc.type).toBe('sine');
    expect(osc.frequency.value).toBe(SELECT_FREQ);
    const { g } = gainChain(osc);
    expect(g.gain.value).toBe(SELECT_GAIN);
    expect(osc.stoppedAt).toBeCloseTo(SELECT_SEC, 10);
    expect(eng.dbg().calls.select).toBe(1);
  });

  it('playCardPickup: sine chirp naik 340->520 Hz, gain 0.018->0.0005, durasi 0.045s', () => {
    const { eng, ctx } = makeEngine();
    eng.playCardPickup();
    expect(ctx.__log.osc).toHaveLength(1);
    const osc = ctx.__log.osc[0];
    expect(osc.type).toBe('sine');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(CARD_PICKUP_FREQ_START, ctx.currentTime);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(CARD_PICKUP_FREQ_END, ctx.currentTime + CARD_PICKUP_SEC);
    const { g } = gainChain(osc);
    expect(g.gain.value).toBe(CARD_PICKUP_GAIN);
    expect(g.gain.ramps[0]).toEqual([CARD_PICKUP_END_GAIN, ctx.currentTime + CARD_PICKUP_SEC]);
    expect(osc.stoppedAt).toBeCloseTo(CARD_PICKUP_SEC, 10);
    expect(eng.dbg().calls.cardPickup).toBe(1);
  });

  it('playCardDrop: triangle thud turun 420->210 Hz, gain 0.022->0.0005, durasi 0.055s', () => {
    const { eng, ctx } = makeEngine();
    eng.playCardDrop();
    expect(ctx.__log.osc).toHaveLength(1);
    const osc = ctx.__log.osc[0];
    expect(osc.type).toBe('triangle');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(CARD_DROP_FREQ_START, ctx.currentTime);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(CARD_DROP_FREQ_END, ctx.currentTime + CARD_DROP_SEC);
    const { g } = gainChain(osc);
    expect(g.gain.value).toBe(CARD_DROP_GAIN);
    expect(g.gain.ramps[0]).toEqual([CARD_DROP_END_GAIN, ctx.currentTime + CARD_DROP_SEC]);
    expect(osc.stoppedAt).toBeCloseTo(CARD_DROP_SEC, 10);
    expect(eng.dbg().calls.cardDrop).toBe(1);
  });

  it('setVolume: mengubah gain master saat unmuted, tetap 0 saat muted', () => {
    const { eng, ctx } = makeEngine();
    eng.ensure();
    eng.setVolume(0.5);
    expect(eng.getVolume()).toBe(0.5);
    expect(eng.dbg().volume).toBe(0.5);
    eng.playSelect();
    const osc = ctx.__log.osc[0];
    expect(gainChain(osc).g.connectedTo.gain.value).toBe(0.5);

    eng.setMuted(true);
    expect(gainChain(osc).g.connectedTo.gain.value).toBe(0);

    eng.setMuted(false);
    expect(gainChain(osc).g.connectedTo.gain.value).toBe(0.5);
  });

  it('dispose: clear semua pending chime + close ctx + reset ke state none', () => {
    const { eng, ctx, timeouts } = makeEngine();
    eng.ensure();
    eng.playMeetingChime();
    expect(timeouts.length).toBe(3);
    eng.dispose();
    timeouts.forEach((t) => expect(t).toBeNull()); // semua clearTimeout dipanggil
    expect(ctx.close).toHaveBeenCalled();
    const snap = eng.dbg();
    expect(snap.started).toBe(false);
    expect(snap.state).toBe('none');
    expect(snap.state).not.toBe('running');
  });

  it('masterGainNode: null sebelum ensure, node aktif setelah ensure, null lagi setelah dispose', () => {
    const { eng } = makeEngine();
    expect(eng.masterGainNode()).toBeNull(); // belum started
    eng.ensure();
    const mg = eng.masterGainNode();
    expect(mg).not.toBeNull();
    expect(mg.gain.value).toBe(1); // default masterGainValue(unmuted, vol 1)
    eng.dispose();
    expect(eng.masterGainNode()).toBeNull(); // instrumentasi tak bocor ke state lama
  });

  it('resume/suspend/state passthrough untuk visibilitychange (tab hidden hemat CPU audio)', () => {
    const { eng, ctx } = makeEngine('suspended');
    eng.ensure();
    expect(eng.state()).toBe('running'); // ensure me-resume
    eng.suspend();
    expect(ctx.suspend).toHaveBeenCalled();
    expect(eng.state()).toBe('suspended');
    eng.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(eng.state()).toBe('running');
    // tanpa ctx (belum ensure): state none, no-op aman
    const e2 = makeEngine().eng;
    expect(e2.state()).toBe('none');
    expect(() => { e2.suspend(); e2.resume(); }).not.toThrow();
  });

  it('keyclickFreq konsisten dengan spec (800..1200)', () => {
    expect(keyclickFreq(() => 0)).toBe(KEYCLICK_BASE_FREQ);
    expect(keyclickFreq(() => 1)).toBe(KEYCLICK_BASE_FREQ + KEYCLICK_JITTER);
  });

  it('ambience: startAmbience, stopAmbience, setAmbienceEnabled mengendalikan oscillator & buffer', () => {
    const { eng, ctx } = makeEngine();
    expect(eng.isAmbienceEnabled()).toBe(false);
    expect(eng.isAmbienceActive()).toBe(false);

    eng.setAmbienceEnabled(true);
    expect(eng.isAmbienceEnabled()).toBe(true);
    expect(eng.isAmbienceActive()).toBe(true);
    expect(ctx.__log.osc.length).toBe(2); // fundamental 55Hz & overtone 110Hz
    expect(ctx.__log.buffers.length).toBe(1); // pink noise buffer
    expect(ctx.__log.filters.length).toBe(1); // biquad filter lowpass

    const osc1 = ctx.__log.osc[0];
    const osc2 = ctx.__log.osc[1];
    expect(osc1.frequency.value).toBe(55.0);
    expect(osc2.frequency.value).toBe(110.0);
    expect(osc1.started).toBe(true);
    expect(osc2.started).toBe(true);

    const filter = ctx.__log.filters[0];
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.value).toBe(180);

    // Stop ambience
    eng.stopAmbience();
    expect(eng.isAmbienceEnabled()).toBe(false);
  });

  it('setMuted dan setAmbienceVolume menyinkronkan gain ambience', () => {
    const { eng, ctx } = makeEngine();
    eng.setAmbienceEnabled(true);
    const ambGain = ctx.__log.gains.find(g => g.gain.linearRamps.length > 0);
    expect(ambGain).toBeDefined();

    // Ubah volume ambience
    eng.setAmbienceVolume(0.8);
    expect(eng.getAmbienceVolume()).toBe(0.8);

    // Saat muted -> gain menjadi 0
    eng.setMuted(true);
    const lastRamp = ambGain.gain.linearRamps[ambGain.gain.linearRamps.length - 1];
    expect(lastRamp[0]).toBe(0);

    // Saat unmuted -> gain dipulihkan
    eng.setMuted(false);
    const restoreRamp = ambGain.gain.linearRamps[ambGain.gain.linearRamps.length - 1];
    expect(restoreRamp[0]).toBeGreaterThan(0);
  });

  it('previewAmbience memicu pemutaran sementara dan timer stop', () => {
    const { eng, ctx, timeouts } = makeEngine();
    expect(eng.isAmbienceActive()).toBe(false);

    const ok = eng.previewAmbience(2.0);
    expect(ok).toBe(true);
    expect(eng.dbg().calls.ambience).toBe(1);
    expect(ctx.__log.osc.length).toBe(2);
    expect(timeouts.length).toBeGreaterThan(0);

    // Trigger timer selesai preview -> jika ambience disabled, stop dipanggil
    const previewTimeout = timeouts[timeouts.length - 1];
    previewTimeout.fn();
    expect(eng.isAmbienceEnabled()).toBe(false);
  });
});
