import type { Mission } from '../types';

export function missionTypeLabel(mission: Mission): string {
  return { surface: 'Lunar surface', flyby: 'Lunar flyby', 'orbital-demo': 'Earth-orbit demonstration' }[mission.missionType];
}

export function missionExplorerUrl(mission: Mission): string | null {
  if (mission.missionType !== 'surface' || mission.status === 'Cancelled') return null;
  if (mission.siteId) return `/explorer?${new URLSearchParams({ site: mission.siteId })}`;
  if (!Number.isFinite(mission.latitude) || !Number.isFinite(mission.longitude)
      || Math.abs(mission.latitude!) > 90 || Math.abs(mission.longitude!) > 180) return null;
  return `/explorer?${new URLSearchParams({ lat: String(mission.latitude), lon: String(mission.longitude), name: mission.name })}`;
}

export function explorerDestination(params: URLSearchParams, validSiteIds: string[]) {
  const siteId = params.get('site');
  if (siteId && validSiteIds.includes(siteId)) return { siteId, location: null };
  const lat = params.get('lat');
  const lon = params.get('lon');
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (lat && lon && decimal.test(lat) && decimal.test(lon)) {
    const latitude = Number(lat), longitude = Number(lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { siteId: null, location: { latitude, longitude, name: params.get('name')?.slice(0, 160) || 'Selected Moon coordinate' } };
    }
  }
  return { siteId: null, location: null };
}
