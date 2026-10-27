// Unit test timing percakapan kolaborasi (converse_timing.js) — diekstrak
// murni dari converse() di motion.js: talkStep, isConverseOver, speakerIsVisitor.
import { describe, it, expect } from 'vitest';
import { talkStep, isConverseOver, speakerIsVisitor, CONVERSE_TAIL } from '../scene/parts/converse_timing.js';

describe('converse_timing: talkStep', () => {
  it('step = floor(walkPause / lineSec)', () => {
    expect(talkStep(0, 1.8)).toBe(0);
    expect(talkStep(1.79, 1.8)).toBe(0);
    expect(talkStep(1.8, 1.8)).toBe(1);
    expect(talkStep(5.4, 1.8)).toBe(3);
    expect(talkStep(7.3, 1.8)).toBe(4);
  });
  it('walkPause negatif (inisialisasi _talk=-1, walkPause=0 awal) → clamp ke 0', () => {
    expect(talkStep(-2, 1.8)).toBe(0);
  });
  it('lineSec custom ikut dipakai', () => {
    expect(talkStep(1.0, 0.5)).toBe(2);
  });
  it('guard anti-poisoning: walkPause non-finite (NaN/±Infinity) → 0', () => {
    expect(talkStep(NaN, 1.8)).toBe(0);
    expect(talkStep(Infinity, 1.8)).toBe(0);
    expect(talkStep(-Infinity, 1.8)).toBe(0);
  });
  it('guard anti-poisoning: lineSec non-finite / <= 0 → 0 (bukan Infinity)', () => {
    expect(talkStep(3.6, NaN)).toBe(0);
    expect(talkStep(3.6, Infinity)).toBe(0);
    expect(talkStep(3.6, 0)).toBe(0);
    expect(talkStep(3.6, -1.8)).toBe(0);
  });
});

describe('converse_timing: isConverseOver', () => {
  it('jeda akhir = 1.2 detik (CONVERSE_TAIL)', () => {
    expect(CONVERSE_TAIL).toBe(1.2);
  });
  it('belum selesai selama baris + jeda', () => {
    // 4 baris × 1.8 = 7.2, selesai tepat di 8.4 (strict >)
    expect(isConverseOver(0, 4, 1.8)).toBe(false);
    expect(isConverseOver(7.2, 4, 1.8)).toBe(false);
    expect(isConverseOver(8.39, 4, 1.8)).toBe(false);
  });
  it('selesai tepat setelah batas & boundary strict >', () => {
    expect(isConverseOver(8.4, 4, 1.8)).toBe(false); // 8.4 > 8.4 salah (boundary sama persis)
    expect(isConverseOver(8.41, 4, 1.8)).toBe(true);
    expect(isConverseOver(1.21, 0, 1.8)).toBe(true); // tanpa baris: hanya jeda
  });
  it('guard anti-poisoning: input non-finite/rusak → false (tidak selesai)', () => {
    expect(isConverseOver(NaN, 4, 1.8)).toBe(false);
    expect(isConverseOver(Infinity, 4, 1.8)).toBe(false);
    expect(isConverseOver(8.41, 4, NaN)).toBe(false);
    expect(isConverseOver(8.41, NaN, 1.8)).toBe(false);
    expect(isConverseOver(8.41, 4.5, 1.8)).toBe(false); // lineCount non-integer
    expect(isConverseOver(8.41, -1, 1.8)).toBe(false);  // lineCount negatif
  });
});

describe('converse_timing: speakerIsVisitor', () => {
  it('baris genap = pengunjung, ganjil = tuan rumah (pola bergantian)', () => {
    expect(speakerIsVisitor(0)).toBe(true);
    expect(speakerIsVisitor(1)).toBe(false);
    expect(speakerIsVisitor(2)).toBe(true);
    expect(speakerIsVisitor(3)).toBe(false);
  });
});
