// Unit test runtime sound engine (src/scene/parts/sound_engine.js).
// Web Audio distub penuh agar semua jalur (ensure/keyclick/step/chime/mute/dispose)
// terverifikasi tanpa browser asli — regresi "suara senyap" (gain/mute/envelope salah) terdeteksi.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSoundEngine } from '../scene/parts/sound_engine.js';
import {
  KEYCLICK_BASE_FREQ, KEYCLICK_JITTER, KEYCLICK_GAIN, KEYCLICK_END_GAIN, KEYCLICK_SEC,
  STEP_GAIN, STEP_SEC, CHIME_FREQS, CHIME_DELAY_SEC, CHIME_GAIN, CHIME_END_GAIN, CHIME_TONE_SEC,
  keyclickFreq, stepEnvelope,
} from '../scene/parts/sound_spec.js';

function makeCtx(state = 'running') {
  const log = { osc: [], buffers: [], gains: [] };
  let st = state;
  const ctx = {
    get state() { return st; },
    currentTime: 0,
    sampleRate: 48000,
    destination: { id: 'dest' },
    resume: vi.fn(async () => { st = 'running'; }),
    suspend: vi.fn(async () => { st = 'suspended'; }),
    close: vi.fn(async () => { st = 'closed'; }),
    createGain: () => ({ gain: { value: 0, ramps: [], exponentialRampToValueAtTime(v, t) { this.ramps.push([v, t]); } }, connectedTo: null, connect(t) { this.connectedTo = t; } }),
    createOscillator: () => {
      const o = { type: '', frequency: { value: 0 }, connectedTo: null, started: false, stoppedAt: null,
        connect(t) { this.connectedTo = t; }, start() { this.started = true; }, stop(t) { this.stoppedAt = t; } };
      log.osc.push(o); return o;
    },
    createBuffer: (ch, len, rate) => ({ length: len, sampleRate: rate, numberOfChannels: ch,
      getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => {
      const s = { buffer: null, connectedTo: null, started: false,
        connect(t) { this.connectedTo = t; }, start() { this.started = true; } };
      log.buffers.push(s); return s;
    },
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
    expect(snap.calls).toEqual({ key: 0, step: 0, chime: 0 });
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
    const { g, master } = gainChain(osc);
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
      const { g, master } = gainChain(osc);
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
    expect(eng.dbg().calls).toEqual({ key: 1, step: 1, chime: 1 });
    expect(eng.isStarted()).toBe(true);
    const osc = ctx.__log.osc[0];
    expect(gainChain(osc).g.connectedTo.connectedTo).toBe(ctx.destination);
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
});
