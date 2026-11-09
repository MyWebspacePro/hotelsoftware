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
}

/** Zeilenfortsetzung (" " am Zeilenanfang) auflösen. */
function unfoldIcal(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
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

function unescapeIcal(text: string): string {
  return text
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Zeile auf 74 Oktette falten (RFC 5545 §3.1), Fortsetzung mit Leerzeichen. */
function foldLine(line: string): string[] {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  chunks.push(rest);
  return chunks;
}

/**
 * iCal-Datumswert → ISO "YYYY-MM-DD". Akzeptiert VALUE=DATE (20261115) und
 * DATE-TIME-Werte (20261115T150000Z / mit TZID) — dort wird der Datumsteil genommen.
 */
function icalDateValue(raw: string): string | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : iso;
}

/**
 * Parst einen iCal-Text und liefert alle gültigen VEVENTs.
 * Fehlerhafte/datumslose Einträge werden übersprungen (robust ggü. Portal-Feeds).
 * Ohne UID wird ein deterministischer Fallback aus Inhalt gebildet.
 */
export function parseIcalCalendar(text: string): IcalExternalEvent[] {
  const lines = unfoldIcal(text);
  const events: IcalExternalEvent[] = [];

  let inEvent = false;
  let uid: string | null = null;
  let summary: string | null = null;
  let description: string | null = null;
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let fallbackParts: string[] = [];

  const flush = () => {
    if (!inEvent) return;
    if (dateFrom && dateTo && dateTo > dateFrom) {
      const finalUid =
        uid?.trim() ||
        `AUTO-${dateFrom}-${dateTo}-${fallbackParts.join("|").slice(0, 80)}`;
      events.push({ uid: finalUid, summary, description, dateFrom, dateTo });
    }
    inEvent = false;
    uid = null;
    summary = null;
    description = null;
    dateFrom = null;
    dateTo = null;
    fallbackParts = [];
  };

  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const rawName = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = rawName.split(";")[0].toUpperCase();

    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") {
      flush();
      inEvent = true;
      continue;
    }
    if (name === "END" && value.toUpperCase() === "VEVENT") {
      flush();
      continue;
    }
    if (!inEvent) continue;

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
      case "DTSTART": {
        const iso = icalDateValue(value);
        if (iso) {
          dateFrom = iso;
          fallbackParts.push(iso);
        }
        break;
      }
      case "DTEND":
      case "DURATION": {
        // DURATION (PTxD) wird nicht unterstützt — nur DTEND-Feeds gelten als vollständig
        if (name === "DTEND") {
          const iso = icalDateValue(value);
          if (iso) {
            dateTo = iso;
            fallbackParts.push(iso);
          }
        }
        break;
      }
    }
  }
  flush();

  return events;
}

function icalStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/**
 * Erzeugt einen iCal-Export (VCALENDAR) aus Aufenthalten.
 * dateTo ist hier die Abreise (exklusiv) — wird unverändert als DTEND geschrieben.
 */
export function buildIcalCalendar(
  events: { uid: string; summary?: string | null; description?: string | null; dateFrom: string; dateTo: string }[],
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
    lines.push("STATUS:CONFIRMED", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return lines.flatMap((l) => foldLine(l)).join("\r\n") + "\r\n";
}
