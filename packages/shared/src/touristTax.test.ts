import { describe, expect, it } from "vitest";
import { ageAtNight, computeTouristTax, TOURIST_TAX_EXAMPLE_AT, type TouristTaxSeason } from "./touristTax.js";

describe("computeTouristTax", () => {
  it("Kitzbühel-Beispiel: 2 Erw. × 3 Nächte × 5,00 €, Kinder < 15 frei", () => {
    const r = computeTouristTax([TOURIST_TAX_EXAMPLE_AT], ["2026-02-20", "2026-02-21", "2026-02-22"], [
      { age: null },
      { age: null },
      { age: 12 },
    ]);
    expect(r.totalCents).toBe(3000);
    const night = r.details[0];
    expect(night.adults).toBe(2);
    expect(night.childrenFree).toBe(1);
    expect(night.rateAdultCents).toBe(500);
  });

  it("Saisonwechsel: alte und neue Sätze je Nacht", () => {
    const seasons: TouristTaxSeason[] = [
      { validFrom: "2026-01-01", validTo: "2026-02-01", adultCentsPerNight: 350, childUntilAge: 15, childCentsPerNight: 0 },
      { validFrom: "2026-02-01", validTo: "2099-01-01", adultCentsPerNight: 500, childUntilAge: 15, childCentsPerNight: 0 },
    ];
    const r = computeTouristTax(seasons, ["2026-01-31", "2026-02-01"], [{ age: null }]);
    expect(r.details[0].subtotalCents).toBe(350);
    expect(r.details[1].subtotalCents).toBe(500);
    expect(r.totalCents).toBe(850);
  });

  it("ermäßigter Kindersatz (DE-Kommune-Stil)", () => {
    const withReduced: TouristTaxSeason[] = [
      { validFrom: "2026-01-01", validTo: "2099-01-01", adultCentsPerNight: 300, childUntilAge: 17, childCentsPerNight: 150 },
    ];
    const r = computeTouristTax(withReduced, ["2026-03-10"], [{ age: null }, { age: 10 }, { age: 5 }]);
    expect(r.totalCents).toBe(600);
    expect(r.details[0].childrenPaid).toBe(2);
  });

  it("überlappende Saisons: jüngste validFrom gewinnt unabhängig von der Reihenfolge", () => {
    const a: TouristTaxSeason = { validFrom: "2026-01-01", validTo: "2099-01-01", adultCentsPerNight: 100, childUntilAge: 15, childCentsPerNight: 0 };
    const b: TouristTaxSeason = { validFrom: "2026-06-01", validTo: "2099-01-01", adultCentsPerNight: 200, childUntilAge: 15, childCentsPerNight: 0 };
    expect(computeTouristTax([a, b], ["2026-07-01"], [{ age: null }]).details[0].subtotalCents).toBe(200);
    expect(computeTouristTax([b, a], ["2026-07-01"], [{ age: null }]).details[0].subtotalCents).toBe(200);
    expect(computeTouristTax([a, b], ["2026-03-01"], [{ age: null }]).details[0].subtotalCents).toBe(100);
  });

  it("kaputte Saison (validFrom >= validTo) wird ignoriert", () => {
    const broken: TouristTaxSeason = { validFrom: "2026-05-01", validTo: "2026-05-01", adultCentsPerNight: 999, childUntilAge: 15, childCentsPerNight: 0 };
    const r = computeTouristTax([broken], ["2026-05-01"], [{ age: null }]);
    expect(r.details[0].unconfigured).toBe(true);
  });

  it("Nacht ohne Konfiguration → unconfigured", () => {
    const r = computeTouristTax([TOURIST_TAX_EXAMPLE_AT], ["2026-01-15"], [{ age: null }]);
    expect(r.totalCents).toBe(0);
    expect(r.details[0].unconfigured).toBe(true);
  });

  it("Kind genau an der Grenze (15) ist frei bei untilAge 15", () => {
    const r = computeTouristTax([TOURIST_TAX_EXAMPLE_AT], ["2026-03-01"], [{ age: 15 }, { age: 16 }]);
    expect(r.totalCents).toBe(500);
  });

  it("ungültiges Alter (NaN) zählt als Erwachsener", () => {
    const r = computeTouristTax([TOURIST_TAX_EXAMPLE_AT], ["2026-03-01"], [{ age: Number.NaN }]);
    expect(r.details[0].adults).toBe(1);
  });
});

describe("ageAtNight", () => {
  it("Alter bezogen auf die Nacht (vor/nach Geburtstag)", () => {
    expect(ageAtNight("2011-06-15", "2026-06-14")).toBe(14);
    expect(ageAtNight("2011-06-15", "2026-06-15")).toBe(15);
    expect(ageAtNight(null, "2026-06-15")).toBeNull();
    expect(ageAtNight("not-a-date", "2026-06-15")).toBeNull();
  });
});