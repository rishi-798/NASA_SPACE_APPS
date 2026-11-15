import * as THREE from 'three';

export type RegolithTextures = {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  dispose: () => void;
};

/**
 * Generates procedural lunar regolith diffuse and micro-normal maps
 * simulating sub-meter regolith dust, micro-craters, and grazing-shadow roughness
 * without altering the underlying 1:1 SLDEM2015 measured elevation mesh.
 */
export function createRegolithTextures(extent: number): RegolithTextures {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const normCtx = normCanvas.getContext('2d');

  if (!ctx || !normCtx) {
    const dummy = new THREE.CanvasTexture(canvas);
    return { map: dummy, normalMap: dummy, dispose: () => dummy.dispose() };
  }

  const heights = new Float32Array(size * size);
  const colorData = ctx.createImageData(size, size);
  const cData = colorData.data;

  // Linear congruential generator for deterministic, reproducible regolith grain
  let seed = 19690720; // Apollo 11 epoch seed
  function rand(): number {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  // Pre-generate micro-craters (Voronoi impact bowls with raised rims)
  const craterCount = 36;
  const craters = Array.from({ length: craterCount }, () => ({
    x: rand() * size,
    y: rand() * size,
    r: 4 + rand() * 22,
    depth: 0.12 + rand() * 0.38,
  }));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      // High-frequency regolith grain
      let h = (rand() - 0.5) * 0.08;

      // Subtle medium-frequency undulation
      const nx = x / size, ny = y / size;
      h += Math.sin(nx * 20.0) * Math.cos(ny * 20.0) * 0.04;
      h += Math.sin(nx * 48.0 + ny * 32.0) * 0.025;

      // Micro-craters
      for (let c = 0; c < craterCount; c++) {
        const cr = craters[c]!;
        let dx = Math.abs(x - cr.x);
        let dy = Math.abs(y - cr.y);
        if (dx > size / 2) dx = size - dx;
        if (dy > size / 2) dy = size - dy;
        const d = Math.hypot(dx, dy);

        if (d < cr.r * 1.4) {
          const normD = d / cr.r;
          if (normD < 1.0) {
            // Bowl depression (parabolic)
            h -= cr.depth * (1.0 - normD * normD);
          } else {
            // Ejecta rim
            const rimD = (normD - 1.0) / 0.4;
            h += (cr.depth * 0.32) * Math.sin(rimD * Math.PI);
          }
        }
      }

      heights[idx] = h;

      // Lunar regolith albedo: dark neutral gray (~0.12 reflectance)
      const baseTone = 62 + Math.round(h * 55 + (rand() - 0.5) * 14);
      const tone = Math.max(32, Math.min(108, baseTone));
      const pIdx = idx * 4;
      cData[pIdx] = tone;
      cData[pIdx + 1] = Math.round(tone * 0.98);
      cData[pIdx + 2] = Math.round(tone * 0.96);
      cData[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(colorData, 0, 0);

  // Compute tangent-space normal map using Sobel filter
  const normData = normCtx.createImageData(size, size);
  const nData = normData.data;
  const strength = 3.6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xL = (x - 1 + size) % size;
      const xR = (x + 1) % size;
      const yU = (y - 1 + size) % size;
      const yD = (y + 1) % size;

      const dzdx = (heights[y * size + xR]! - heights[y * size + xL]!) * strength;
      const dzdy = (heights[yD * size + x]! - heights[yU * size + x]!) * strength;

      let nx = -dzdx;
      let ny = -dzdy;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const pIdx = (y * size + x) * 4;
      nData[pIdx] = Math.round((nx * 0.5 + 0.5) * 255);
      nData[pIdx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nData[pIdx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nData[pIdx + 3] = 255;
    }
  }

  normCtx.putImageData(normData, 0, 0);

  const repeats = Math.max(28, Math.round(extent / 45));

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeats, repeats);
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = new THREE.CanvasTexture(normCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeats, repeats);

  return {
    map,
    normalMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
    },
  };
}
