import type { Mission } from '../types';

export function missionTypeLabel(mission: Mission): string {
  return { surface: 'Lunar surface', flyby: 'Lunar flyby', 'orbital-demo': 'Earth-orbit demonstration' }[mission.missionType];
}

export function missionExplorerUrl(mission: Mission): string | null {
  const location = mission.explorationContext ?? {latitude: mission.latitude, longitude: mission.longitude};
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)
      || Math.abs(location.latitude!) > 90 || Math.abs(location.longitude!) > 180) return null;
  const params = new URLSearchParams({lat: String(location.latitude), lon: String(location.longitude), name: mission.name});
  if (mission.siteId) params.set('site', mission.siteId);
  if (mission.explorationEpoch) params.set('time', mission.explorationEpoch);
  if (mission.explorationNote) params.set('context', mission.explorationNote);
  return `/explorer?${params}`;
}

export function explorerDestination(params: URLSearchParams, validSiteIds: string[]): {siteId: string | null; location: {latitude: number; longitude: number; name: string} | null; time?: string} {
  const rawTime = params.get('time');
  const epoch = rawTime && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(rawTime) ? Date.parse(rawTime) : NaN;
  const extra = Number.isFinite(epoch) ? {time: new Date(epoch).toISOString()} : {};
  const siteId = params.get('site');
  if (siteId && validSiteIds.includes(siteId)) return { siteId, location: null, ...extra };
  const lat = params.get('lat');
  const lon = params.get('lon');
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (lat && lon && decimal.test(lat) && decimal.test(lon)) {
    const latitude = Number(lat), longitude = Number(lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { siteId: null, location: { latitude, longitude, name: params.get('name')?.slice(0, 160) || 'Selected Moon coordinate' }, ...extra };
    }
  }
  return { siteId: null, location: null };
}

/** Restore a mission epoch without losing Explorer's editable range and cadence controls. */
export function missionRangeInput<T extends {startDate: string; startTime: string; endDate: string; endTime: string}>(time: string | undefined, fallback: T): T {
  if (!time || !Number.isFinite(Date.parse(time))) return {...fallback};
  const start = new Date(time).toISOString();
  const end = new Date(Date.parse(time) + 86400000).toISOString();
  return {...fallback, startDate: start.slice(0,10), startTime: start.slice(11,16), endDate: end.slice(0,10), endTime: end.slice(11,16)};
}
