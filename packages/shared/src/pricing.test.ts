import { describe, expect, it } from "vitest";
import { averageNightlyCents, priceForStay, type PriceRuleLike } from "./pricing.js";

const rules: PriceRuleLike[] = [
  { id: "r1", dateFrom: "2026-12-20", dateTo: "2027-01-06", priceCents: 25000, minStay: 3 },
  { id: "r2", dateFrom: "2026-11-01", dateTo: "2026-12-20", priceCents: 12000 },
];

describe("priceForStay", () => {
  it("Basispreis ohne Regel", () => {
    const r = priceForStay("2026-03-10", "2026-03-12", [], 9900);
    expect(r.perNightCents["2026-03-10"]).toBe(9900);
    expect(r.totalCents).toBe(19800);
    expect(r.nights).toBe(2);
    expect(r.minStayRequired).toBe(1);
  });

  it("Saisonregel deckt kompletten Aufenthalt", () => {
    const r = priceForStay("2026-12-24", "2026-12-27", rules, 9900);
    expect(r.totalCents).toBe(75000);
    expect(r.minStayRequired).toBe(3);
    expect(r.appliedRuleIds["2026-12-24"]).toBe("r1");
  });

  it("Regelübergang: Weihnachtspreis erst ab 20.12.", () => {
    const r = priceForStay("2026-12-19", "2026-12-21", rules, 9900);
    expect(r.perNightCents["2026-12-19"]).toBe(12000);
    expect(r.perNightCents["2026-12-20"]).toBe(25000);
    expect(r.totalCents).toBe(37000);
  });

  it("spezifischere (längere) Regel gewinnt bei Überlappung", () => {
    const overlapping: PriceRuleLike[] = [
      { id: "short", dateFrom: "2026-02-10", dateTo: "2026-02-14", priceCents: 20000 },
      { id: "long", dateFrom: "2026-02-01", dateTo: "2026-03-01", priceCents: 10000 },
    ];
    const r = priceForStay("2026-02-11", "2026-02-12", overlapping, 0);
    expect(r.perNightCents["2026-02-11"]).toBe(10000);
    const r2 = priceForStay("2026-02-16", "2026-02-17", overlapping, 0);
    expect(r2.perNightCents["2026-02-16"]).toBe(10000);
  });

  it("bei gleich langen Regeln gewinnt der spätere Beginn", () => {
    const overlapping: PriceRuleLike[] = [
      { id: "a", dateFrom: "2026-02-01", dateTo: "2026-02-10", priceCents: 111 },
      { id: "b", dateFrom: "2026-02-05", dateTo: "2026-02-14", priceCents: 222 },
    ];
    const r = priceForStay("2026-02-06", "2026-02-07", overlapping, 0);
    expect(r.perNightCents["2026-02-06"]).toBe(222);
  });

  it("stopSell wird gezählt", () => {
    const r = priceForStay("2026-12-24", "2026-12-26", [{ id: "s", dateFrom: "2026-12-24", dateTo: "2026-12-25", priceCents: 100, stopSell: true }], 0);
    expect(r.stopSellNights).toBe(1);
  });
});

describe("averageNightlyCents", () => {
  it("ADR gerundet", () => {
    const r = priceForStay("2026-12-19", "2026-12-21", rules, 9900);
    expect(averageNightlyCents(r)).toBe(18500);
    expect(averageNightlyCents({ perNightCents: {}, totalCents: 0, nights: 0, appliedRuleIds: {}, minStayRequired: 1, stopSellNights: 0 })).toBe(0);
  });
});