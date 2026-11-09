/**
 * Datums-Helfer für Beherbergungslogik.
 * Konvention: ISO-Strings "YYYY-MM-DD", Aufenthalt = halboffenes Intervall
 * [dateFrom, dateTo) — die Nacht vom dateFrom bis (ausschließlich) dateTo.
 */

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(parseIsoDate(iso).getTime());
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86400000);
}

/** Anzahl Nächte eines Aufenthalts [from, to). */
export function nightsBetween(fromIso: string, toIso: string): number {
  return Math.max(0, daysBetween(fromIso, toIso));
}

/** Alle Nächte (Anfangstage) eines Aufenthalts. */
export function eachNight(fromIso: string, toIso: string): string[] {
  const nights: string[] = [];
  let cursor = fromIso;
  while (cursor < toIso) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nights;
}

/** Halboffene Intervall-Überlappung: aFrom < bTo && bFrom < aTo. */
export function overlaps(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom < bTo && bFrom < aTo;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Montag der Woche (ISO 8601: Woche beginnt Montag). */
export function startOfWeek(iso: string): string {
  const d = parseIsoDate(iso);
  const day = d.getUTCDay(); // 0 = So … 6 = Sa
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toIsoDate(d);
}

/** Kalendertage inklusive beider Enden (Urlaubstage). */
export function inclusiveDays(fromIso: string, toIso: string): number {
  if (toIso < fromIso) return 0;
  return daysBetween(fromIso, toIso) + 1;
}
