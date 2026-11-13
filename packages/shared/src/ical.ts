/**
 * iCal-Engine (RFC 5545, minimal): Import & Export von Kalender-Feeds
 * für Buchungsportale (Airbnb, Booking.com & Co.).
 *
 * Beide Portale senden/erwarten DTSTART/DTEND mit VALUE=DATE, wobei DTEND
 * die Abreise (exklusiv) ist — passt exakt zur halboffenen Intervall-Konvention
 * [dateFrom, dateTo) des Restes der Codebasis.
 */

export interface IcalExternalEvent {
  uid: string;
  summary: string | null;
  description: string | null;
  dateFrom: string; // YYYY-MM-DD, Anreise
  dateTo: string; // YYYY-MM-DD, Abreise (exklusiv)
  /** STATUS des VEVENT (z. B. CONFIRMED, CANCELLED); null = nicht gesetzt. */
  status: string | null;
}

/** Zeilenfortsetzung (" " / "\t" am Zeilenanfang) auflösen. */
function unfoldIcal(text: string): string[] {
  const rawLines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim().length > 0) {
      lines.push(line);
    }
  }
  return lines;
}

/** RFC-5545-Unescape in einem Durchlauf (Backslash darf nicht doppelt ersetzt werden). */
function unescapeIcal(text: string): string {
  return text.replace(/\\([\\;,nN])/g, (_m, c: string) => {
    if (c === "n" || c === "N") return "\n";
    return c;
  });
}

function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** RFC 5545 §3.1: Zeilen auf max. 75 Oktette (UTF-8) falten, Fortsetzung mit Leerzeichen. */
function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let rest = line;
  while (encoder.encode(rest).length > 75) {
    // Maximal 74 Oktette Inhalt + 1 Leerzeichen = 75
    let cut = rest.length;
    while (cut > 1 && encoder.encode(rest.slice(0, cut)).length > 74) cut -= 1;
    chunks.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  chunks.push(rest);
  return chunks;
}

/** iCal-Datumswert → ISO "YYYY-MM-DD". Akzeptiert VALUE=DATE und DATE-TIME (Datumsteil). */
function icalDateValue(raw: string): string | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Round-Trip: 20260230akzeptiert JS still — hier abwehren.
  if (d.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/** DURATION (PTxH / PxD / PxW) → Nächte; 0 = unbekannt. */
function durationNights(raw: string): number {
  const weeks = /^P(\d+)W$/i.exec(raw.trim());
  if (weeks) return Number(weeks[1]) * 7;
  const days = /^P(\d+)D$/i.exec(raw.trim());
  if (days) return Number(days[1]);
  const hours = /^PT(\d+(?:\.\d+)?)H$/i.exec(raw.trim());
  if (hours) return Math.max(1, Math.round(Number(hours[1]) / 24));
  return 0;
}

/**
 * Parst einen iCal-Text und liefert alle gültigen VEVENTs.
 * Komponenten werden über einen Stack verwaltet (VALARM/VTIMEZONE-intern werden
 * ignoriert). Fehlerhafte/datumslose Einträge werden übersprungen.
 */
export function parseIcalCalendar(text: string): IcalExternalEvent[] {
  const lines = unfoldIcal(text);
  const events: IcalExternalEvent[] = [];

  const stack: string[] = [];
  let inEvent = false;
  let uid: string | null = null;
  let summary: string | null = null;
  let description: string | null = null;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let duration = 0;
  let status: string | null = null;
  let fallbackParts: string[] = [];

  const flush = () => {
    if (inEvent && dateFrom) {
      const end = dateTo ?? (duration > 0 ? addDaysIso(dateFrom, duration) : null);
      if (end && end > dateFrom) {
        const finalUid =
          uid?.trim() ||
          `AUTO-${dateFrom}-${end}-${[...fallbackParts, summary ?? ""].join("|").slice(0, 80)}`;
        events.push({ uid: finalUid, summary, description, dateFrom, dateTo: end, status });
      }
    }
    inEvent = false;
    uid = null;
    summary = null;
    description = null;
    dateFrom = null;
    dateTo = null;
    duration = 0;
    status = null;
    fallbackParts = [];
  };

  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const rawName = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = rawName.split(";")[0].toUpperCase();

    if (name === "BEGIN") {
      const comp = value.trim().toUpperCase();
      if (comp === "VEVENT") {
        flush();
        inEvent = true;
        stack.push("VEVENT");
        continue;
      }
      stack.push(comp);
      continue;
    }
    if (name === "END") {
      const comp = value.trim().toUpperCase();
      if (comp === "VEVENT") {
        flush();
      }
      // nur schließen, wenn es der oberste Eintrag ist
      if (stack[stack.length - 1] === comp) stack.pop();
      else {
        const idx = stack.lastIndexOf(comp);
        if (idx >= 0) stack.length = idx;
      }
      continue;
    }

    // Nur Properties auf VEVENT-Ebene (Stack endet mit VEVENT) verarbeiten.
    if (!inEvent || stack[stack.length - 1] !== "VEVENT") continue;

    switch (name) {
      case "UID":
        uid = value.trim();
        break;
      case "SUMMARY":
        summary = unescapeIcal(value).trim() || null;
        break;
      case "DESCRIPTION":
        description = unescapeIcal(value).trim() || null;
        break;
      case "STATUS":
        status = value.trim().toUpperCase() || null;
        break;
      case "DTSTART": {
        const iso = icalDateValue(value);
        if (iso) {
          dateFrom = iso;
          fallbackParts.push(iso);
        }
        break;
      }
      case "DTEND": {
        const iso = icalDateValue(value);
        if (iso) {
          dateTo = iso;
          fallbackParts.push(iso);
        }
        break;
      }
      case "DURATION":
        duration = durationNights(value);
        break;
    }
  }
  flush();

  return events;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function icalStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/**
 * Erzeugt einen iCal-Export (VCALENDAR) aus Aufenthalten.
 * dateTo ist hier die Abreise (exklusiv) — wird unverändert als DTEND geschrieben.
 */
export function buildIcalCalendar(
  events: { uid: string; summary?: string | null; description?: string | null; dateFrom: string; dateTo: string; status?: string | null }[],
  calendarName: string,
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HotelGuru//Buchungskalender//DE",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcal(calendarName)}`,
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcal(ev.uid)}`,
      `DTSTAMP:${icalStamp(new Date())}`,
      `DTSTART;VALUE=DATE:${ev.dateFrom.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${ev.dateTo.replace(/-/g, "")}`,
    );
    if (ev.summary) lines.push(`SUMMARY:${escapeIcal(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcal(ev.description)}`);
    lines.push(`STATUS:${(ev.status ?? "CONFIRMED").toUpperCase()}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return lines.flatMap((l) => foldLine(l)).join("\r\n") + "\r\n";
}