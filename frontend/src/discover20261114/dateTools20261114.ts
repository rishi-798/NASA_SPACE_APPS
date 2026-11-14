// 2026-11-14 — UTC calendar arithmetic avoids local DST shifts.
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function shiftDay(day: string, amount: number): string {
  const instant = new Date(`${day}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(instant.getTime()) || utcDay(instant) !== day) {
    throw new Error("Choose a valid calendar date.");
  }
  instant.setUTCDate(instant.getUTCDate() + amount);
  return utcDay(instant);
}
