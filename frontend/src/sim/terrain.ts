/**
 * Terrain surfaces for the landing simulation, in the local frame (x east, y north, z up, metres;
 * z = 0 at the surface under the target). Heights are NaN where no data exists; nothing is filled in.
 */
export type SlopeEstimate = { deg: number; scaleM: number; method: string } | null;

export type Terrain = {
  kind: "synthetic" | "lola";
  /** Shown everywhere the result appears (UI, report, export). */
  label: string;
  /** Half-width of the supported square area, metres. */
  halfSizeM: number;
  heightAt: (x: number, y: number) => number;
  slopeAt: (x: number, y: number) => SlopeEstimate;
  /** Grid used to draw the surface: the same heights the physics uses. */
  grid: { count: number; spacingM: number; heights: (number | null)[][] };
  source: string;
  sampleSpacingM: number | null;
  missingCells: number;
  notes: string[];
};

/** SYNTHETIC TRAINING SURFACE: a plane tilted by `slopeDeg` going downhill toward `downhillAzimuthDeg`. */
export function syntheticPlane(slopeDeg = 0, downhillAzimuthDeg = 90, halfSizeM = 2000): Terrain {
  if (!(slopeDeg >= 0 && slopeDeg <= 45)) throw new RangeError("Synthetic slope must be 0–45°.");
  const g = Math.tan((slopeDeg * Math.PI) / 180), az = (downhillAzimuthDeg * Math.PI) / 180;
  const sx = Math.sin(az), sy = Math.cos(az);
  const heightAt = (x: number, y: number) => -g * (x * sx + y * sy);
  const count = 41, spacingM = (2 * halfSizeM) / (count - 1);
  const heights = Array.from({ length: count }, (_, r) => Array.from({ length: count }, (_, c) => heightAt(-halfSizeM + c * spacingM, -halfSizeM + r * spacingM)));
  return {
    kind: "synthetic",
    label: slopeDeg === 0 ? "Synthetic training scenario: flat surface" : `Synthetic training scenario: ${slopeDeg}° plane`,
    halfSizeM, heightAt,
    slopeAt: () => ({ deg: slopeDeg, scaleM: Infinity, method: "exact slope of the synthetic plane" }),
    grid: { count, spacingM, heights }, source: "Synthetic (not a real lunar location)", sampleSpacingM: null, missingCells: 0,
    notes: ["Synthetic surface for practice. It does not represent any real lunar site."],
  };
}

export type TerrainPatch = {
  target: { latitude: number; longitude: number; dem_height_m: number };
  half_size_m: number; spacing_m: number; count: number; heights_m: (number | null)[][];
  missing_cells: number; source: string; datum: string; limitations: string[];
};

/** Real LOLA terrain from GET /api/sim/terrain: bilinear between grid nodes; NaN if any neighbour is missing. */
export function gridTerrain(patch: TerrainPatch, siteName: string): Terrain {
  const { count, spacing_m: s, half_size_m: half } = patch;
  const h = patch.heights_m;
  if (!Array.isArray(h) || h.length !== count || h.some((row) => row.length !== count)) throw new Error("Terrain patch has an unexpected shape.");
  const node = (r: number, c: number) => { const v = h[r]?.[c]; return typeof v === "number" ? v : NaN; };
  const heightAt = (x: number, y: number) => {
    const fc = (x + half) / s, fr = (y + half) / s;
    const c = Math.floor(fc), r = Math.floor(fr);
    if (c < 0 || r < 0 || c >= count - 1 || r >= count - 1) {
      if ((c === count - 1 && fc === c) || (r === count - 1 && fr === r)) return node(Math.min(r, count - 1), Math.min(c, count - 1));
      return NaN;
    }
    const a = fc - c, b = fr - r;
    return node(r, c) * (1 - a) * (1 - b) + node(r, c + 1) * a * (1 - b) + node(r + 1, c) * (1 - a) * b + node(r + 1, c + 1) * a * b;
  };
  /** Least-squares plane through the 3×3 grid nodes around the nearest node (2 spacings = 160 m across). */
  const slopeAt = (x: number, y: number): SlopeEstimate => {
    const c = Math.round((x + half) / s), r = Math.round((y + half) / s);
    if (c < 1 || r < 1 || c > count - 2 || r > count - 2) return null;
    let sxz = 0, syz = 0, sxx = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const z = node(r + dr, c + dc);
      if (!Number.isFinite(z)) return null;
      sxz += dc * s * z; syz += dr * s * z; sxx += (dc * s) ** 2;
    }
    const gx = sxz / sxx, gy = syz / sxx;              // symmetric 3×3 stencil: Σx² = Σy²
    return { deg: (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI, scaleM: 2 * s, method: "least-squares plane through 3×3 DEM samples" };
  };
  return {
    kind: "lola", label: `Real terrain: ${siteName} (LOLA 80 m DEM)`, halfSizeM: half, heightAt, slopeAt,
    grid: { count, spacingM: s, heights: h }, source: patch.source, sampleSpacingM: s, missingCells: patch.missing_cells,
    notes: [...patch.limitations, patch.datum],
  };
}
