import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { drawScreenFrame, shouldRedrawScreenAt } from '../scene/parts/effects.js';

it('initializes all 26 low-quality monitor textures before freezing their redraws', () => {
  const src = readFileSync(new URL('../scene/OfficeScene.js', import.meta.url), 'utf8');
  const draw = src.match(/const drawScreen=\(s,i\)=>\{[^\n]+/)[0];
  const schedule = src.match(/ {2}if\(!__quality.low[^\n]+screenData.forEach\(drawScreen\);/)[0];
  const screens = Array.from({ length: 26 }, () => ({
    ctx: new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) }),
    canvas: { width: 256, height: 128 }, type: 'terminal', hex: '#38bdf8',
    tex: { updates: 0, set needsUpdate(value) { if (value) this.updates++; } },
  }));
  const tick = new Function('screenData', 'drawScreenFrame', 'shouldRedrawScreenAt', '__quality', 'frame',
    `const __screenT = frame / 30; ${draw}\n${schedule}`);
  for (let frame = 1; frame <= 6; frame++) tick(screens, drawScreenFrame, shouldRedrawScreenAt, { low: true }, frame);
  expect(screens.filter(s => s.tex.updates > 0)).toHaveLength(26);
  expect(screens.every(s => s.tex.updates === 1)).toBe(true);
  for (let frame = 7; frame <= 30; frame++) tick(screens, drawScreenFrame, shouldRedrawScreenAt, { low: true }, frame);
  expect(screens.every(s => s.tex.updates === 1)).toBe(true);
});

it('reports rotation off by default in low quality but honors explicit user override', () => {
  const src = readFileSync(new URL('../scene/OfficeScene.js', import.meta.url), 'utf8');
  const defaults = src.match(/const autoRotDefault=\(\)=>[^\n]+/)[0];
  const rotation = src.match(/ {2}if\(autoRot[^\n]+autoRotateStep\(sph,delta\);updCam\(\)\}/)[0];
  const listener = src.match(/const __prmListener=\(e\)=>\{[^\n]+/)[0];
  const setter = src.match(/setAutoRotate: \(v\) => (\{[^\n]+\}),/)[1];
  const run = new Function('__quality', '__userRot', '__prm', 'localStorage', 'autoRotateStep', 'setAutoRotatePref',
    `${defaults}\nlet autoRot=autoRotDefault(); const sph={theta:0}; const delta=1; const updCam=()=>{};
     ${listener}\n__prmListener({matches:false}); const initial=autoRot;
     ${rotation}\nconst initialTheta=sph.theta;
     const setAutoRotate=(v)=>${setter}; setAutoRotate(true);
     ${rotation}\nconst enabledTheta=sph.theta; const enabled=autoRot;
     setAutoRotate(false); ${rotation}\nreturn {initial, initialTheta, enabled, enabledTheta, finalTheta:sph.theta, final:autoRot};`);
  const result = run({low:true}, null, {matches:false}, {setItem(){}}, sph => {sph.theta++;}, () => {});
  expect(result).toEqual({initial:false, initialTheta:0, enabled:true, enabledTheta:1, finalTheta:1, final:false});
  expect(run({low:true}, true, {matches:true}, {setItem(){}}, sph => {sph.theta++;}, () => {}).initialTheta).toBe(1);
  expect(run({low:false}, null, {matches:false}, {setItem(){}}, sph => {sph.theta++;}, () => {}).initialTheta).toBe(1);
});

it('applies capability quality and light budget before first render, samples initialization, and resets on visibility resume', () => {
  const src = readFileSync(new URL('../scene/OfficeScene.js', import.meta.url), 'utf8');
  expect(src).toContain('startupQuality(');
  expect(src).toContain('renderer.setPixelRatio(__quality.pixelRatio)');
  expect(src.indexOf('applyLightBudget(scene,')).toBeLessThan(src.indexOf('renderer.render(scene,camera)'));
  expect(src).toContain('t0:__renderStart');
  expect(src).toContain('discontinuity: true');
  expect(src).toContain('if(autoRot){autoRotateStep(sph,delta);updCam()}');
  expect(src).toContain('if(!__quality.low || frame <= 6)screenData.forEach(drawScreen)');
});
import { startupQuality, applyLightBudget } from '../scene/parts/render_startup.js';

describe('conservative render startup', () => {
  it('starts software renderers without shadows at DPR 0.75', () => {
    expect(startupQuality({ renderer: 'ANGLE SwiftShader Device', devicePixelRatio: 2, cores: 8 }))
      .toMatchObject({ low: true, pixelRatio: 0.75, shadows: false });
  });
  it('uses low quality on a two-core device or low reported memory', () => {
    expect(startupQuality({ cores: 2 }).low).toBe(true);
    expect(startupQuality({ memory: 2 }).low).toBe(true);
  });
  it('does not guess software rendering when capabilities are unavailable', () => {
    expect(startupQuality({ devicePixelRatio: 2 })).toMatchObject({ low: false, pixelRatio: 1.5, shadows: true });
  });
  it('bounds point lights while keeping sun, ambient, geometry and original intensities intact', () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(); const ambient = new THREE.AmbientLight();
    scene.add(sun, ambient, new THREE.Mesh());
    for (let i = 0; i < 20; i++) scene.add(new THREE.PointLight(0xffffff, .4));
    applyLightBudget(scene, 4);
    expect(scene.children.filter(x => x.isPointLight && x.visible)).toHaveLength(4);
    expect(scene.children.filter(x => x.isPointLight).every(x => x.intensity === .4)).toBe(true);
    expect(sun.visible && ambient.visible).toBe(true);
    expect(scene.children).toHaveLength(23);
  });
});
