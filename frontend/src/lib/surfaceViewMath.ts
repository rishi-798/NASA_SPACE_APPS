export type Vec3 = [number, number, number];
export const EYE_HEIGHT_M = 1.8;
export function eyePosition(point: Vec3, up: Vec3 = [0, 0, 1]): Vec3 {
  const length = Math.hypot(...up);
  if (!length) throw new Error('Surface up must be nonzero');
  return point.map((value, i) => value + EYE_HEIGHT_M * up[i]! / length) as Vec3;
}
export function lookDirection(yaw: number, pitch: number): Vec3 {
  return [Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
}
export function surfaceTime(start: string, minutes: number): string {
  const epoch = Date.parse(start);
  if (!Number.isFinite(epoch) || minutes < 0 || minutes > 1440) throw new Error('Invalid surface time');
  return new Date(epoch + minutes * 60000).toISOString();
}
