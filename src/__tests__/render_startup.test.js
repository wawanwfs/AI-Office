import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

it('applies capability quality and light budget before first render, samples initialization, and resets on visibility resume', () => {
  const src = readFileSync(new URL('../scene/OfficeScene.js', import.meta.url), 'utf8');
  expect(src).toContain('startupQuality(');
  expect(src).toContain('renderer.setPixelRatio(__quality.pixelRatio)');
  expect(src.indexOf('applyLightBudget(scene,')).toBeLessThan(src.indexOf('renderer.render(scene,camera)'));
  expect(src).toContain('t0:__renderStart');
  expect(src).toContain('discontinuity: true');
  expect(src).toContain('if(autoRot && !__quality.low)');
  expect(src).toContain('if(!__quality.low || frame === 1)screenData.forEach(drawScreen)');
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
