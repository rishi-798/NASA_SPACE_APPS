export function formatCoordinate(value: number, axis: "lat" | "lon") {
  const suffix =
    axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  return `${Math.abs(value).toFixed(2)}° ${suffix}`;
}

export function formatSignedDegree(value: number) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}°`;
}

export function formatAzimuth(value: number) {
  return `${value.toFixed(1).padStart(5, "0")}°`;
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
