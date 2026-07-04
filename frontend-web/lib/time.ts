/**
 * Parse a server timestamp into epoch ms.
 *
 * The backend serializes timestamps with `datetime.isoformat()` on naive-UTC
 * values, e.g. "2026-06-30T04:00:04.478977" — no `Z`/offset. `new Date()` parses
 * a datetime string without an offset as LOCAL time, which skews every value by
 * the viewer's UTC offset. Treat a no-offset string as UTC.
 */
export function parseServerTimestamp(
  value: string | number | null | undefined,
  fallback: number = Date.now(),
): number {
  if (value == null) return fallback;
  if (typeof value === 'number') return value;
  const hasZone = /([zZ])|([+-]\d\d:?\d\d)$/.test(value);
  const parsed = new Date(hasZone ? value : `${value}Z`).getTime();
  return Number.isNaN(parsed) ? fallback : parsed;
}
