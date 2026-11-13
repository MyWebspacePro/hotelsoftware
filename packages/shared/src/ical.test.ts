import { describe, expect, it } from "vitest";
import { buildIcalCalendar, parseIcalCalendar } from "./ical.js";

const ics = (...lines: string[]) => lines.join("\r\n");

describe("ical", () => {
  it("parst einen Airbnb-artigen Feed (VALUE=DATE)", () => {
    const events = parseIcalCalendar(
      ics(
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Airbnb//Booking Calendar//EN",
        "BEGIN:VEVENT",
        "UID:abc123@airbnb.com",
        "DTSTAMP:20261109T120000Z",
        "DTSTART;VALUE=DATE:20261220",
        "DTEND;VALUE=DATE:20261227",
        "SUMMARY:Max Muster",
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
      ),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      uid: "abc123@airbnb.com",
      summary: "Max Muster",
      dateFrom: "2026-12-20",
      dateTo: "2026-12-27",
      status: "CONFIRMED",
    });
  });

  it("löst Zeilenfortsetzungen auf und unescaped \\, \\; \\n", () => {
    const [ev] = parseIcalCalendar(
      ics(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:folded",
        "DTSTART;VALUE=DATE:20270110",
        "DTEND;VALUE=DATE:20270112",
        "SUMMARY:Anna Berg\\, Hündin Luna mit ei",
        " ner langen Zeile",
        "DESCRIPTION:Erste Zeile\\nZweite Zeile\\; mit Detail",
        "END:VEVENT",
        "END:VCALENDAR",
      ),
    );
    expect(ev.summary).toBe("Anna Berg, Hündin Luna mit einer langen Zeile");
    expect(ev.description).toBe("Erste Zeile\nZweite Zeile; mit Detail");
  });

  it("escapt Backslash nicht doppelt (\\\\n bleibt Backslash + n)", () => {
    const [ev] = parseIcalCalendar(
      ics(
        "BEGIN:VEVENT",
        "UID:bs",
        "DTSTART;VALUE=DATE:20270101",
        "DTEND;VALUE=DATE:20270102",
        "DESCRIPTION:Pfad C:\\\\n",
        "END:VEVENT",
      ),
    );
    expect(ev.description).toBe("Pfad C:\\n");
  });

  it("VALARM-Daten überschreiben das Event NICHT", () => {
    const [ev] = parseIcalCalendar(
      ics(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:ev1",
        "DTSTART;VALUE=DATE:20270201",
        "DTEND;VALUE=DATE:20270204",
        "SUMMARY:echt",
        "BEGIN:VALARM",
        "TRIGGER:-PT30M",
        "DTSTART:19700101T000000Z",
        "DTEND:19700101T000100Z",
        "SUMMARY:Alarm",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
      ),
    );
    expect(ev).toMatchObject({ uid: "ev1", summary: "echt", dateFrom: "2027-02-01", dateTo: "2027-02-04" });
  });

  it("VTIMEZONE-intern wird ignoriert", () => {
    const events = parseIcalCalendar(
      ics(
        "BEGIN:VCALENDAR",
        "BEGIN:VTIMEZONE",
        "TZID:Europe/Vienna",
        "BEGIN:STANDARD",
        "DTSTART:19701025T030000",
        "END:STANDARD",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        "UID:x",
        "DTSTART;VALUE=DATE:20270101",
        "DTEND;VALUE=DATE:20270102",
        "END:VEVENT",
        "END:VCALENDAR",
      ),
    );
    expect(events.map((e) => e.uid)).toEqual(["x"]);
  });

  it("nimmt bei DATE-TIME-Werten (TZID/Z) den Datumsteil", () => {
    const [ev] = parseIcalCalendar(
      ics(
        "BEGIN:VEVENT",
        "UID:dt1",
        "DTSTART;TZID=Europe/Vienna:20270315T150000",
        "DTEND;TZID=Europe/Vienna:20270318T110000",
        "END:VEVENT",
      ),
    );
    expect(ev.dateFrom).toBe("2027-03-15");
    expect(ev.dateTo).toBe("2027-03-18");
  });

  it(" unterstützt DURATION, wenn DTEND fehlt", () => {
    const [ev] = parseIcalCalendar(
      ics(
        "BEGIN:VEVENT",
        "UID:dur",
        "DTSTART;VALUE=DATE:20270401",
        "DURATION:P3D",
        "END:VEVENT",
      ),
    );
    expect(ev.dateTo).toBe("2027-04-04");
  });

  it("überspringt Einträge ohne Ende, mit ungültigem Datum oder 0 Nächten", () => {
    const events = parseIcalCalendar(
      ics(
        "BEGIN:VEVENT",
        "UID:no-end",
        "DTSTART;VALUE=DATE:20270401",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:zero",
        "DTSTART;VALUE=DATE:20270405",
        "DTEND;VALUE=DATE:20270405",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:invalid",
        "DTSTART;VALUE=DATE:20270230",
        "DTEND;VALUE=DATE:20270305",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:valid",
        "DTSTART;VALUE=DATE:20270410",
        "DTEND;VALUE=DATE:20270412",
        "END:VEVENT",
      ),
    );
    expect(events.map((e) => e.uid)).toEqual(["valid"]);
  });

  it("bildet einen deterministischen Fallback-UID", () => {
    const feed = ics(
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20270501",
      "DTEND;VALUE=DATE:20270503",
      "SUMMARY:Ohne UID",
      "END:VEVENT",
    );
    const a = parseIcalCalendar(feed);
    const b = parseIcalCalendar(feed);
    expect(a[0].uid).toBe(b[0].uid);
    expect(a[0].uid).toContain("2027-05-01");
  });

  it("baut einen gültigen Feed mit gefalteter SUMMARY", () => {
    const longName = "Langer Gastname ".repeat(6).trim();
    const out = buildIcalCalendar(
      [{ uid: "hg-1@hotelguru", summary: longName, description: "Doppelzimmer", dateFrom: "2026-12-20", dateTo: "2026-12-27" }],
      "Hotel Alpina Montana",
    );
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).toContain("DTSTART;VALUE=DATE:20261220");
    expect(out).toContain("DTEND;VALUE=DATE:20261227");
    for (const line of out.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    const [ev] = parseIcalCalendar(out);
    expect(ev.summary).toBe(longName);
    expect(ev.uid).toBe("hg-1@hotelguru");
  });

  it("faltet lange Umlaute nach Oktetten, nicht Zeichen", () => {
    const out = buildIcalCalendar(
      [{ uid: "umlaut", summary: "ü".repeat(60), dateFrom: "2027-01-01", dateTo: "2027-01-02" }],
      "Hotel",
    );
    for (const line of out.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(parseIcalCalendar(out)[0].summary).toBe("ü".repeat(60));
  });

  it("Round-Trip: Booking.com-artiger Feed bleibt stabil (Kern-Felder)", () => {
    const original = ics(
      "BEGIN:VCALENDAR",
      "X-WR-CALNAME:booking.com Kalender",
      "BEGIN:VEVENT",
      "UID:98765@booking.com",
      "DTSTART;VALUE=DATE:20270105",
      "DTEND;VALUE=DATE:20270109",
      "SUMMARY:Familie Kraus (2 Erw)",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    );
    const parsed = parseIcalCalendar(original);
    const rebuilt = buildIcalCalendar(parsed, "Export");
    const reparsed = parseIcalCalendar(rebuilt);
    expect(reparsed.map(({ uid, dateFrom, dateTo, summary, status }) => ({ uid, dateFrom, dateTo, summary, status }))).toEqual(
      parsed.map(({ uid, dateFrom, dateTo, summary, status }) => ({ uid, dateFrom, dateTo, summary, status })),
    );
  });
});