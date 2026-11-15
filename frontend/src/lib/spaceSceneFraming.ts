import * as THREE from 'three';

/** Frame both spherical bodies while keeping the Earth–Moon axis horizontal. */
export function frameEarthMoon(earth: THREE.Vector3, moon: THREE.Vector3, viewNormal: THREE.Vector3,
  earthRadius: number, moonRadius: number, verticalFov: number, aspect: number) {
  const direction = moon.clone().sub(earth);
  const separation = direction.length();
  if (!Number.isFinite(aspect) || aspect <= 0 || separation <= 0) throw new Error('Invalid mission view dimensions');
  direction.normalize();
  const up = viewNormal.clone().cross(direction).normalize();
  const target = earth.clone().addScaledVector(direction, (separation + moonRadius - earthRadius) / 2);
  const halfVertical = THREE.MathUtils.degToRad(verticalFov / 2);
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const distance = Math.max(9.2, (separation + earthRadius + moonRadius) / (2 * Math.tan(halfHorizontal)) * 1.18,
    earthRadius * 1.25 / Math.tan(halfVertical));
  return { target, up, distance };
}
