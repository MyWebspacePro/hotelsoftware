import { describe, expect, it } from "vitest";
import { buildDatevCsv, buildGenericCsv, DEFAULT_MAPPING_DATEV, DEFAULT_MAPPING_GENERIC, type FibuBucketRow } from "./fibu.js";

const rows: FibuBucketRow[] = [
  {
    invoiceNumber: "AT-2026-RE-0001",
    date: "2026-11-09",
    currency: "EUR",
    text: "Rechnung Sabine Meyer",
    taxRate: 0.1,
    taxCategory: "LOGIS",
    isTouristTax: false,
    netCents: 36000,
    grossCents: 39600,
  },
  {
    invoiceNumber: "AT-2026-RE-0001",
    date: "2026-11-09",
    currency: "EUR",
    text: "Kurtaxe",
    taxRate: 0,
    taxCategory: "OTHER",
    isTouristTax: true,
    netCents: 1500,
    grossCents: 1500,
  },
];

describe("buildDatevCsv", () => {
  const csv = buildDatevCsv(rows);

  it("Kopfzeile und zwei Buchungszeilen", () => {
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Sollkonto;Habenkonto;Umsatz");
  });

  it("Logis auf Erlöskonto 6200, Kurtaxe auf 6600, Debitor 10000", () => {
    expect(csv).toContain('"10000";"6200";"396,00"');
    expect(csv).toContain('"10000";"6600";"15,00"');
  });

  it("Steuer-Kurzform enthält Prozent", () => {
    expect(csv).toContain('"10USt"');
  });

  it("escapt Semikolon/Quote/CRLF in Freitextfeldern", () => {
    const tricky: FibuBucketRow = { ...rows[0], invoiceNumber: 'RE;1"2', text: "Zeile1\nZeile2; x" };
    const out = buildDatevCsv([tricky]);
    const dataLine = out.trim().split("\r\n")[1];
    // Belegfeld enthält verdoppelte Quotes und Semikolon; Text ohne echte Umbrüche
    expect(dataLine).toContain('"RE;1""2"');
    expect(dataLine).toContain("Zeile1 Zeile2; x");
    expect(dataLine.split("\r\n")).toHaveLength(1);
  });
});

describe("buildGenericCsv", () => {
  const csv = buildGenericCsv(rows, DEFAULT_MAPPING_GENERIC);

  it("Netto/Steuer/Brutto je Bucket + Kategorie-Spalte", () => {
    expect(csv).toContain('"3000";"LOGIS";"360,00";"36,00";"396,00"');
    expect(csv).toContain("TOURIST_TAX");
    expect(csv).toContain('"3300"');
    expect(csv).toContain('"1100"');
    expect(DEFAULT_MAPPING_GENERIC.accounts.LOGIS).toBe("3000");
  });
});