/**
 * Datums-Helfer für Beherbergungslogik.
 * Konvention: ISO-Strings "YYYY-MM-DD", Aufenthalt = halboffenes Intervall
 * [dateFrom, dateTo) — die Nacht vom dateFrom bis (ausschließlich) dateTo.
 *
 * Rechenoperationen laufen bewusst in UTC (zeitzonen-/DST-stabil). Nur die
 * Umwandlung "jetzt → ISO" (toIsoDate/todayIso) verwendet die lokale Zeit,
 * damit "heute" im Hotel-Standort korrekt ist.
 */

/** UTC-Datum als ISO (für interne Arithmetik). */
export function formatUtcIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Lokales Kalenderdatum als ISO (für "heute" und Anzeige). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isValidIsoDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) return false;
  // Round-Trip: 2026-02-30 würde sonst still auf den 02.03. rollen.
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3]);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatUtcIso(d);
}

/** Kalenderjahre addieren (Schaltjahr-korrekt, z. B. 2024-02-29 + 1 = 2025-02-28). */
export function addYears(iso: string, years: number): string {
  const d = parseIsoDate(iso);
  const targetYear = d.getUTCFullYear() + years;
  d.setUTCFullYear(targetYear);
  // 29.02. → nicht-Schaltjahr: auf 28.02. normalisieren
  if (d.getUTCMonth() !== parseIsoDate(iso).getUTCMonth()) {
    d.setUTCDate(0);
  }
  return formatUtcIso(d);
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

/** Heutiges lokales Kalenderdatum. */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Montag der Woche (ISO 8601: Woche beginnt Montag). */
export function startOfWeek(iso: string): string {
  const d = parseIsoDate(iso);
  const day = d.getUTCDay(); // 0 = So … 6 = Sa
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return formatUtcIso(d);
}

/** Kalendertage inklusive beider Enden (Urlaubstage). */
export function inclusiveDays(fromIso: string, toIso: string): number {
  if (toIso < fromIso) return 0;
  return daysBetween(fromIso, toIso) + 1;
}