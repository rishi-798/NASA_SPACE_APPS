/** Spherical reference geometry; the footprints are NOT permanent-shadow masks. */
export type ReferenceCrater = {name: string; latitude: number; longitude: number; diameterKm: number; source: string};
const RADIUS_KM = 1737.4;
const radians = (v: number) => v * Math.PI / 180;
export function lunarDistanceKm(a: {latitude: number; longitude: number}, b: {latitude: number; longitude: number}) {
  const dlat = radians(b.latitude - a.latitude), dlon = radians(b.longitude - a.longitude);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dlon / 2) ** 2;
  return 2 * RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function nearestReferenceCrater(latitude: number, longitude: number, craters: ReferenceCrater[]) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude > -75 || latitude < -90 || Math.abs(longitude) > 180) return null;
  return craters.map(crater => ({crater, distanceKm: Math.max(0, lunarDistanceKm({latitude, longitude}, crater) - crater.diameterKm / 2)}))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;
}
export function craterOutline(crater: ReferenceCrater) {
  const lat = radians(crater.latitude), lon = radians(crater.longitude), distance = crater.diameterKm / 2 / RADIUS_KM;
  return Array.from({length: 72}, (_, i) => {
    const bearing = i * Math.PI / 36;
    const phi = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const lambda = lon + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(phi));
    return {latitude: phi * 180 / Math.PI, longitude: ((lambda * 180 / Math.PI + 540) % 360) - 180};
  });
}
