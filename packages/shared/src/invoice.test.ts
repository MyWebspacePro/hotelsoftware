import { describe, expect, it } from "vitest";
import { invoiceTotals, type InvoiceLineInput } from "./invoice.js";

const lines: InvoiceLineInput[] = [
  { text: "Logis Standard", qty: 3, unitPriceCents: 12000, taxRate: 0.07, taxRateKey: "DE_LOGIS_7", taxCategory: "LOGIS" },
  { text: "Frühstück", qty: 3, unitPriceCents: 1800, taxRate: 0.07, taxRateKey: "DE_SPEISEN_7", taxCategory: "FOOD" },
  { text: "Minibar", qty: 1, unitPriceCents: 950, taxRate: 0.19, taxRateKey: "DE_STD_19", taxCategory: "OTHER" },
  { text: "Kurtaxe", qty: 6, unitPriceCents: 300, taxRate: 0, taxRateKey: "TAX", taxCategory: "OTHER", isTouristTax: true },
];

describe("invoiceTotals (EUR)", () => {
  const t = invoiceTotals(lines);

  it("Buckets nach Steuerschlüssel gruppiert", () => {
    expect(t.buckets.map((b) => b.taxRateKey)).toEqual(["DE_LOGIS_7", "DE_SPEISEN_7", "DE_STD_19", "TAX"]);
    const logis = t.buckets[0];
    expect(logis.netCents).toBe(36000);
    expect(logis.taxCents).toBe(2520);
    expect(logis.grossCents).toBe(38520);
  });

  it("Kurtaxe ohne Steuer separat ausweisbar", () => {
    const tax = t.buckets.find((b) => b.isTouristTax)!;
    expect(tax.taxCents).toBe(0);
    expect(tax.grossCents).toBe(1800);
  });

  it("Gesamtsummen", () => {
    expect(t.netCents).toBe(36000 + 5400 + 950 + 1800);
    expect(t.taxCents).toBe(2520 + 378 + 181);
    expect(t.grossCents).toBe(t.netCents + t.taxCents);
  });

  it("Zeilen mit Einzelsummen", () => {
    expect(t.lines[2].totalCents).toBe(950);
  });
});

describe("invoiceTotals (CHF 0,05-Rundung)", () => {
  it("brutto auf 5-Rappen, Steuer als Differenz", () => {
    const t = invoiceTotals(
      [{ text: "Logis", qty: 1, unitPriceCents: 10000, taxRate: 0.038, taxRateKey: "CH_LOGIS_38", taxCategory: "LOGIS" }],
      { currency: "CHF" },
    );
    expect(t.netCents).toBe(10000);
    expect(t.grossCents % 5).toBe(0);
    expect(t.grossCents).toBe(10380); // 103,80 € exakt
    expect(t.grossCents).toBe(t.netCents + t.taxCents);
  });

  it("rundet 1.234 Rappen-Korrektur auf 5er", () => {
    const t = invoiceTotals(
      [{ text: "Bar", qty: 3, unitPriceCents: 333, taxRate: 0.081, taxRateKey: "CH_GASTRO_81", taxCategory: "FOOD" }],
      { currency: "CHF" },
    );
    expect(t.grossCents % 5).toBe(0);
    expect(t.grossCents).toBe(t.netCents + t.taxCents);
  });
});

describe("invoiceTotals Bucket-Trennung", () => {
  it("gleicher Key mit anderer Rate wird nicht vermischt", () => {
    const t = invoiceTotals([
      { text: "a", qty: 1, unitPriceCents: 10000, taxRate: 0.07, taxRateKey: "X", taxCategory: "LOGIS" },
      { text: "b", qty: 1, unitPriceCents: 10000, taxRate: 0.19, taxRateKey: "X", taxCategory: "LOGIS" },
    ]);
    expect(t.buckets).toHaveLength(2);
    expect(t.netCents).toBe(20000);
    expect(t.taxCents).toBe(700 + 1900);
  });
});