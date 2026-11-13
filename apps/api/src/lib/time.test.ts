import { describe, expect, it } from "vitest";
import { isoDateInZone, todayInZone, zonedDayBounds, zonedStartOfDay } from "./time.js";

const TZ = "Europe/Vienna";

describe("zonedStartOfDay", () => {
  it("Winterzeit: lokaler Tagesbeginn ist 23:00 UTC des Vortags", () => {
    const start = zonedStartOfDay("2026-01-15", TZ);
    expect(start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
  });

  it("Sommerzeit (CEST): lokaler Tagesbeginn ist 22:00 UTC des Vortags", () => {
    const start = zonedStartOfDay("2026-07-15", TZ);
    expect(start.toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  it("UTC ist unverändert", () => {
    expect(zonedStartOfDay("2026-01-15", "UTC").toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("zonedDayBounds", () => {
  it("Fenster endet exklusiv am nächsten lokalen Tagesbeginn", () => {
    const { start, end } = zonedDayBounds("2026-03-29", TZ); // DST-Wechsel in Wien
    expect(end.getTime() - start.getTime()).toBe(23 * 3600 * 1000);
  });

  it("regulärer Tag hat 24 Stunden", () => {
    const { start, end } = zonedDayBounds("2026-06-10", TZ);
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
  });
});

describe("isoDateInZone / todayInZone", () => {
  it("23:30 UTC ist in Wien bereits der nächste Tag", () => {
    expect(isoDateInZone(new Date("2026-06-10T23:30:00.000Z"), TZ)).toBe("2026-06-11");
  });

  it("todayInZone liefert ein gültiges ISO-Datum", () => {
    expect(todayInZone(TZ)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});