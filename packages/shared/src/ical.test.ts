import { describe, expect, it } from "vitest";
import { buildIcalCalendar, parseIcalCalendar } from "./ical.js";

describe("ical", () => {
  it("parst einen Airbnb-artigen Feed (VALUE=DATE)", () => {
    const ics = [
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
    ].join("\r\n");
    const events = parseIcalCalendar(ics);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      uid: "abc123@airbnb.com",
      summary: "Max Muster",
      dateFrom: "2026-12-20",
      dateTo: "2026-12-27",
    });
  });

  it("löst Zeilenfortsetzungen auf und unescaped \\, \\; \\n", () => {
    const ics = [
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
    ].join("\r\n");
    const [ev] = parseIcalCalendar(ics);
    expect(ev.summary).toBe("Anna Berg, Hündin Luna mit einer langen Zeile");
    expect(ev.description).toBe("Erste Zeile\nZweite Zeile; mit Detail");
  });

  it("ignoriert VALARM und Blöcke außerhalb von VEVENT", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "DTSTART:20261109T000000",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:ev1",
      "DTSTART;VALUE=DATE:20270201",
      "DTEND;VALUE=DATE:20270204",
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "DTSTART:19700101T000000Z",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseIcalCalendar(ics);
    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe("ev1");
  });

  it("nimmt bei DATE-TIME-Werten (TZID/Z) den Datumsteil", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:dt1",
      "DTSTART;TZID=Europe/Vienna:20270315T150000",
      "DTEND;TZID=Europe/Vienna:20270318T110000",
      "END:VEVENT",
    ].join("\n");
    const [ev] = parseIcalCalendar(ics);
    expect(ev.dateFrom).toBe("2027-03-15");
    expect(ev.dateTo).toBe("2027-03-18");
  });

  it("überspringt Einträge ohne DTEND, mit ungültigem Datum oder 0 Nächten", () => {
    const ics = [
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
      "UID:valid",
      "DTSTART;VALUE=DATE:20270410",
      "DTEND;VALUE=DATE:20270412",
      "END:VEVENT",
    ].join("\n");
    const events = parseIcalCalendar(ics);
    expect(events.map((e) => e.uid)).toEqual(["valid"]);
  });

  it("bildet einen deterministischen Fallback-UID", () => {
    const ics = [
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20270501",
      "DTEND;VALUE=DATE:20270503",
      "SUMMARY:Ohne UID",
      "END:VEVENT",
    ].join("\n");
    const a = parseIcalCalendar(ics);
    const b = parseIcalCalendar(ics);
    expect(a[0].uid).toBe(b[0].uid);
    expect(a[0].uid).toContain("2027-05-01");
  });

  it("baut einen gültigen Feed mit gefalteter SUMMARY", () => {
    const longName = "Langer Gastname ".repeat(6).trim();
    const ics = buildIcalCalendar(
      [
        {
          uid: "hg-1@hotelguru",
          summary: longName,
          description: "Doppelzimmer",
          dateFrom: "2026-12-20",
          dateTo: "2026-12-27",
        },
      ],
      "Hotel Alpina Montana",
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261220");
    expect(ics).toContain("DTEND;VALUE=DATE:20261227");
    // RFC-Faltung: Fortsetzungszeilen beginnen mit Leerzeichen, Zeilen ≤ 75 Zeichen
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
    // Round-trip: gefalteter Name kommt vollständig zurück
    const [ev] = parseIcalCalendar(ics);
    expect(ev.summary).toBe(longName);
    expect(ev.uid).toBe("hg-1@hotelguru");
  });

  it("Round-Trip: Booking.com-artiger Feed bleibt stabil", () => {
    const original = [
      "BEGIN:VCALENDAR",
      "X-WR-CALNAME:booking.com Kalender",
      "BEGIN:VEVENT",
      "UID:98765@booking.com",
      "DTSTART;VALUE=DATE:20270105",
      "DTEND;VALUE=DATE:20270109",
      "SUMMARY:Familie Kraus (2 Erw)",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseIcalCalendar(original);
    const rebuilt = buildIcalCalendar(parsed, "Export");
    const reparsed = parseIcalCalendar(rebuilt);
    expect(reparsed).toEqual(parsed);
  });
});
