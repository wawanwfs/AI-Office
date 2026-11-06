// Capability hints are optional: unavailable information is not proof of a slow GPU.
export function startupQuality({ renderer = '', cores, memory, devicePixelRatio = 1 } = {}) {
  const low = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(renderer)
    || (cores > 0 && cores <= 2) || (memory > 0 && memory <= 2);
  return { low, pixelRatio: low ? 0.75 : Math.min(devicePixelRatio || 1, 1.5), shadows: !low };
}

// Preserve object identities and intensities used by day-cycle/neon/debug hooks.
// Three excludes invisible lights from shader light arrays; intensity=0 alone does not.
export function applyLightBudget(scene, budget) {
  let count = 0;
  scene.traverse(object => {
    if (object.isPointLight) object.visible = count++ < budget;
  });
}
