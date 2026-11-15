export function formatCoordinate(value: number, axis: "lat" | "lon", precision = 2) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(precision));
  if (rounded === 0) return `${(0).toFixed(precision)}°`;
  const suffix =
    axis === "lat" ? (rounded < 0 ? "S" : "N") : rounded < 0 ? "W" : "E";
  return `${Math.abs(rounded).toFixed(precision)}° ${suffix}`;
}

export function formatSignedDegree(value: number, precision = 1) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(precision));
  if (Object.is(rounded, -0) || rounded === 0) return `0.${"0".repeat(precision)}°`;
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(precision)}°`;
}

export function formatAzimuth(value: number, precision = 1) {
  if (!Number.isFinite(value)) return "—";
  const normalized = ((value % 360) + 360) % 360;
  const parts = normalized.toFixed(precision).split(".");
  return `${parts[0].padStart(3, "0")}.${parts[1]}°`;
}

export function formatUtcDisplay(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(iso));
}
