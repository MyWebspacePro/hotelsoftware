import { describe, expect, it } from "vitest";
import {
  addDays,
  addYears,
  daysBetween,
  eachNight,
  inclusiveDays,
  isValidIsoDate,
  nightsBetween,
  overlaps,
  startOfWeek,
  toIsoDate,
} from "./dates.js";

describe("dates", () => {
  it("addDays über Monats- und Jahresgrenzen", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("nightsBetween/eachNight: [from, to) — 2 Nächte bei 1 Nacht-Abstand", () => {
    expect(nightsBetween("2026-03-10", "2026-03-12")).toBe(2);
    expect(eachNight("2026-03-10", "2026-03-12")).toEqual(["2026-03-10", "2026-03-11"]);
    expect(eachNight("2026-03-10", "2026-03-10")).toEqual([]);
  });

  it("daysBetween über DST-stabile UTC-Rechnung", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("overlaps ist halboffen:Checkout-Tag schneidet sich nicht", () => {
    expect(overlaps("2026-03-10", "2026-03-12", "2026-03-12", "2026-03-14")).toBe(false);
    expect(overlaps("2026-03-10", "2026-03-13", "2026-03-12", "2026-03-14")).toBe(true);
    expect(overlaps("2026-03-12", "2026-03-14", "2026-03-10", "2026-03-12")).toBe(false);
  });

  it("toIsoDate nutzt lokale Zeit (kein UTC-Tageswechsel)", () => {
    expect(toIsoDate(new Date(2026, 5, 15, 0, 30))).toBe("2026-06-15");
    expect(toIsoDate(new Date(2026, 5, 15, 23, 59))).toBe("2026-06-15");
  });

  it("isValidIsoDate weist Kalender-Überläufe ab", () => {
    expect(isValidIsoDate("2026-06-15")).toBe(true);
    expect(isValidIsoDate("2026-06-32")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("15.06.2026")).toBe(false);
  });

  it("addYears rechnet Kalenderjahre inkl. Schalttag", () => {
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYears("2026-03-01", 5)).toBe("2031-03-01");
    expect(addYears("2026-01-31", 1)).toBe("2027-01-31");
  });

  it("startOfWeek: Montag der Woche (auch bei Sonntag)", () => {
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-11")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09");
  });

  it("inclusiveDays für Urlaubsanträge", () => {
    expect(inclusiveDays("2026-08-03", "2026-08-07")).toBe(5);
    expect(inclusiveDays("2026-08-07", "2026-08-07")).toBe(1);
    expect(inclusiveDays("2026-08-07", "2026-08-03")).toBe(0);
  });
});