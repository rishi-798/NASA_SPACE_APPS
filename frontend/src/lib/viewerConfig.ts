/** Public, read-only ion configuration can be updated without rebuilding Vite. */
export async function getMoonIonToken(): Promise<string | undefined> {
  const buildToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim();
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/api/viewer-config`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const config: unknown = await response.json();
      if (config && typeof config === 'object' && 'cesiumIonAccessToken' in config) {
        const token = config.cesiumIonAccessToken;
        if (typeof token === 'string' && token.trim()) return token.trim();
      }
    }
  } catch {
    // Older backends may not yet implement this route; retain explicit Vite config.
  }
  return buildToken || undefined;
}
