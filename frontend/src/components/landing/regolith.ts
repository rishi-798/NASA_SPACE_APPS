import * as THREE from "three";

/**
 * Procedural regolith texture (colour + bump), seeded so it looks the same every time.
 * VISUAL ONLY: it changes shading, never the terrain geometry the physics uses.
 */
export function regolithTextures(size = 512, seed = 7) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Tileable value noise from a few octaves of a random lattice.
  const octave = (cells: number) => {
    const lattice = Array.from({ length: cells * cells }, rand);
    const at = (x: number, y: number) => lattice[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)]!;
    return (u: number, v: number) => {
      const x = u * cells, y = v * cells, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
    };
  };
  const layers = [octave(4), octave(8), octave(16), octave(32), octave(64), octave(128)];
  const weights = [0.32, 0.24, 0.17, 0.12, 0.09, 0.06];
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let h = 0;
    layers.forEach((n, i) => { h += n(x / size, y / size) * weights[i]!; });
    height[y * size + x] = h;
  }
  // Small craters: bowl + raised rim, wrapped so the texture still tiles.
  for (let i = 0; i < 70; i++) {
    const cx = rand() * size, cy = rand() * size, r = 3 + rand() ** 2.5 * 28;
    for (let dy = -r * 1.4; dy <= r * 1.4; dy++) for (let dx = -r * 1.4; dx <= r * 1.4; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d > 1.4) continue;
      const px = Math.floor(((cx + dx) % size + size) % size), py = Math.floor(((cy + dy) % size + size) % size);
      const bowl = d < 1 ? -0.22 * (1 - d * d) : 0, rim = 0.08 * Math.exp(-((d - 1) ** 2) / 0.02);
      height[py * size + px]! += bowl + rim;
    }
  }
  const make = (paint: (h: number, i: number) => [number, number, number]) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const [r, g, b] = paint(height[i]!, i);
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 16;
    return texture;
  };
  const map = make((h) => { const v = 150 + (h - 0.5) * 70 + (rand() - 0.5) * 10; return [v, v * 0.98, v * 0.95].map((c) => Math.max(0, Math.min(255, c))) as [number, number, number]; });
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = make((h) => { const v = Math.max(0, Math.min(255, h * 255)); return [v, v, v]; });
  return { map, bump };
}

/** A sphere of faint stars around the scene (no starlight is modelled). */
export function starField(radius = 15000, count = 2500, seed = 3) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1, t = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    positions.push(radius * r * Math.cos(t), radius * Math.abs(u) * 0.95 + 200, radius * r * Math.sin(t));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
}

/**
 * Large-scale brightness variation in metres (cells of ~1100, 420 and 160 m), so the repeating detail
 * texture is not visible from far away. VISUAL ONLY.
 */
export function macroAlbedo(seed = 11) {
  const hash = (i: number, j: number) => {
    let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number, cell: number) => {
    const u = x / cell, v = y / cell, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    return (hash(i, j) * (1 - su) + hash(i + 1, j) * su) * (1 - sv) + (hash(i, j + 1) * (1 - su) + hash(i + 1, j + 1) * su) * sv;
  };
  return (x: number, y: number) => 0.5 * noise(x, y, 1100) + 0.3 * noise(x, y, 420) + 0.2 * noise(x, y, 160);
}
