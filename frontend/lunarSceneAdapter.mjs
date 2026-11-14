/** Framework-independent hooks for the team's existing Cesium viewer. */
export function parseLunarCoordinates(text) {
  const parts = String(text).trim().split(/\s*,\s*/);
  const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (parts.length !== 2 || !parts.every(p => number.test(p))) return null;
  const [latitude, longitude] = parts.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {latitude, longitude};
}

export function searchLunarSites(query, sites) {
  const coordinates = parseLunarCoordinates(query);
  if (coordinates) return [{id: null, name: 'Selected coordinates', ...coordinates}];
  const text = String(query).trim().toLowerCase();
  if (!text) return [];
  return sites.filter(site => site.name.toLowerCase().includes(text));
}

/** Shared identity for Cesium selections, backend terrain and Blender objects. */
export async function resolveLunarGrid(site, {signal, baseUrl = '', fetchImpl = globalThis.fetch} = {}) {
  if (!parseLunarCoordinates(`${site.latitude},${site.longitude}`)) throw new Error('Invalid lunar coordinates');
  const params = new URLSearchParams({lat: String(site.latitude), lon: String(site.longitude)});
  const response = await fetchImpl(`${baseUrl}/api/terrain/lookup?${params}`, {signal});
  if (!response.ok) throw new Error('Terrain lookup unavailable. Check the terrain backend.');
  const selection = await response.json();
  if (typeof selection.grid_id !== 'string' || selection.blender_object_name !== selection.grid_id)
    throw new Error('Terrain backend returned inconsistent grid identity');
  return selection;
}

/** Rendering quality only; this never modifies elevations or source imagery. */
export {applyMoonQuality} from './moonQuality.mjs';

/** Supply the real Moon ellipsoid and the viewer's Moon-fixed-to-world transform. */
export function createLunarSelection({Cesium, viewer, moonEllipsoid, toWorld, onLocalRequest}) {
  if (!moonEllipsoid || typeof toWorld !== 'function' || typeof onLocalRequest !== 'function')
    throw new Error('Moon ellipsoid, coordinate transform and local-scene handler are required');
  let pin;
  return {
    select(site) {
      if (!parseLunarCoordinates(`${site.latitude},${site.longitude}`)) throw new Error('Invalid lunar coordinates');
      const fixed = Cesium.Cartesian3.fromDegrees(site.longitude, site.latitude, 0, moonEllipsoid);
      const position = toWorld(fixed);
      if (pin) viewer.entities.remove(pin);
      pin = viewer.entities.add({position, label: {text: site.name}, point: {
        pixelSize: 9, color: Cesium.Color.YELLOW,
      }});
      viewer.scene.requestRender();
      return pin;
    },
    requestLocal(site, utcTime) {
      if (!parseLunarCoordinates(`${site.latitude},${site.longitude}`)) throw new Error('Invalid lunar coordinates');
      if (typeof utcTime !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(utcTime) || !Number.isFinite(Date.parse(utcTime)))
        throw new Error('A date/time with an explicit timezone is required');
      // Consumer loads available terrain, shows its resolution, and requests backend ephemerides.
      // A Blender project is an authoring file; browser glTF assets must be exported separately.
      return onLocalRequest({site, utcTime: new Date(utcTime).toISOString()});
    },
    dispose() { if (pin) viewer.entities.remove(pin); pin = undefined; },
  };
}
