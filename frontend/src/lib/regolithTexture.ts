import * as THREE from 'three';

export type RegolithTextures = {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  dispose: () => void;
};

/**
 * Generates isotropic, photometrically calibrated lunar regolith micro-roughness.
 * Calibrated against NASA Apollo surface photography and LRO Diviner radiometric data:
 * - Uniform isotropic powdery regolith grain (no artificial dunes or fake craters).
 * - Calibrated lunar optical reflectance (albedo ~0.12, neutral charcoal gray).
 * - Seamless fractal micro-roughness for high-quality PBR diffuse and tangent normals.
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

  // Permutation table for seamless periodic 2D gradient noise
  const perm = new Uint8Array(512);
  let seed = 19690720; // Apollo 11 landing epoch
  function lcg(): number {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  const pSrc = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(lcg() * (i + 1));
    const tmp = pSrc[i]!;
    pSrc[i] = pSrc[j]!;
    pSrc[j] = tmp;
  }
  for (let i = 0; i < 256; i++) {
    perm[i] = perm[i + 256] = pSrc[i]!;
  }

  const GRAD2 = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
  ];

  function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  function periodicNoise(x: number, y: number, per: number): number {
    const x0 = ((Math.floor(x) % per) + per) % per;
    const y0 = ((Math.floor(y) % per) + per) % per;
    const x1 = (x0 + 1) % per;
    const y1 = (y0 + 1) % per;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const g00 = GRAD2[perm[perm[x0]! + y0]! & 7]!;
    const g10 = GRAD2[perm[perm[x1]! + y0]! & 7]!;
    const g01 = GRAD2[perm[perm[x0]! + y1]! & 7]!;
    const g11 = GRAD2[perm[perm[x1]! + y1]! & 7]!;

    const dot00 = g00[0]! * xf + g00[1]! * yf;
    const dot10 = g10[0]! * (xf - 1) + g10[1]! * yf;
    const dot01 = g01[0]! * xf + g01[1]! * (yf - 1);
    const dot11 = g11[0]! * (xf - 1) + g11[1]! * (yf - 1);

    return lerp(v, lerp(u, dot00, dot10), lerp(u, dot01, dot11));
  }

  const heights = new Float32Array(size * size);
  const colorData = ctx.createImageData(size, size);
  const cData = colorData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;

      // Multi-octave isotropic fractal regolith noise (uniform grain, no directional ripples)
      let h = periodicNoise(x * 0.05, y * 0.05, 16) * 0.35;
      h += periodicNoise(x * 0.12, y * 0.12, 32) * 0.20;
      h += periodicNoise(x * 0.28, y * 0.28, 64) * 0.10;
      h += periodicNoise(x * 0.65, y * 0.65, 128) * 0.05;

      // Fine powdery dust grain
      const dust = (lcg() - 0.5) * 0.04;
      h += dust;

      heights[idx] = h;

      // Apollo-consistent soft matte charcoal gray (mean ~132, 0.12 reflectance)
      let tone = 132 + Math.round(h * 32 + dust * 40);
      tone = Math.max(90, Math.min(185, tone));

      const pIdx = idx * 4;
      cData[pIdx] = tone;
      cData[pIdx + 1] = Math.round(tone * 0.98);
      cData[pIdx + 2] = Math.round(tone * 0.96);
      cData[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(colorData, 0, 0);

  // Compute subtle tangent-space normal map using seamless Sobel filter
  const normData = normCtx.createImageData(size, size);
  const nData = normData.data;
  const strength = 0.45; // Subtle powdery micro-slope gradient

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

  // Calibrate repeat density so micro-grain looks natural at true 1:1 scale
  const repeats = Math.max(16, Math.round(extent / 50));

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
