/**
 * Zeitzonen-Helfer: Geschäftstage werden in der Hotel-Zeitzone definiert,
 * nicht in UTC. (DB speichert Zeitpunkte in UTC.)
 */
const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

function partsAt(date: Date, timeZone: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of dtf(timeZone).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  // Intl kann "24" statt "00" liefern
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** Lokales Datum (YYYY-MM-DD) eines Zeitpunkts in der Zone. */
export function isoDateInZone(date: Date, timeZone: string): string {
  const p = partsAt(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "Heute" in der Hotel-Zeitzone. */
export function todayInZone(timeZone: string): string {
  return isoDateInZone(new Date(), timeZone);
}

/** UTC-Startpunkt eines lokalen Datums (00:00) in der Zone. */
export function zonedStartOfDay(dateIso: string, timeZone: string): Date {
  // Ziel ist die lokale Wanduhr "00:00" — als UTC interpretiert.
  const target = Date.parse(`${dateIso}T00:00:00.000Z`);
  let guess = target;
  for (let i = 0; i < 4; i += 1) {
    const p = partsAt(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const offset = asUtc - guess;
    const next = target - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/** UTC-Fenster [start, end) für einen lokalen Kalendertag. */
export function zonedDayBounds(dateIso: string, timeZone: string): { start: Date; end: Date } {
  const next = new Date(`${dateIso}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextIso = next.toISOString().slice(0, 10);
  return { start: zonedStartOfDay(dateIso, timeZone), end: zonedStartOfDay(nextIso, timeZone) };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    dtf(tz);
    return true;
  } catch {
    return false;
  }
}