import { roundHalfUp, roundMoneyCents, type Currency } from "./money.js";

/**
 * Rechnungssummen: mehrwertsteuerliche Gruppierung nach Steuerschlüssel
 * (mehrere Sätze pro Rechnung), Netto/Steuer/Brutto je Bucket + Summen.
 * CHF wird gemäß DATENMODELL auf das 0,05-Raster gerundet.
 */
export type TaxCategoryValue = "LOGIS" | "FOOD" | "OTHER";

export interface InvoiceLineInput {
  text: string;
  qty: number;
  unitPriceCents: number;
  /** Dezimalrate, z. B. 0.07 (= 7 %). */
  taxRate: number;
  taxRateKey: string;
  taxCategory: TaxCategoryValue;
  /** Kurtaxe etc. separat ausweisbar. */
  isTouristTax?: boolean;
}

export interface TaxBucket {
  taxRateKey: string;
  taxRate: number;
  taxCategory: TaxCategoryValue;
  netCents: number;
  taxCents: number;
  grossCents: number;
  isTouristTax: boolean;
}

export interface InvoiceTotals {
  lines: Array<InvoiceLineInput & { totalCents: number }>;
  buckets: TaxBucket[];
  netCents: number;
  taxCents: number;
  grossCents: number;
}

export interface InvoiceConfig {
  currency?: Currency;
}

export function invoiceTotals(lines: InvoiceLineInput[], config: InvoiceConfig = {}): InvoiceTotals {
  const currency = config.currency ?? "EUR";
  const withTotals = lines.map((l) => ({ ...l, totalCents: Math.round(l.qty * l.unitPriceCents) }));
  const map = new Map<string, TaxBucket>();
  for (const line of withTotals) {
    // Gleicher Steuerschlüssel mit abweichender Rate/Kategorie darf nicht
    // still in einen Bucket fallen — der vollständige Kontext ist Teil des Keys.
    const key = `${line.taxRateKey}|${line.taxRate}|${line.taxCategory}|${line.isTouristTax ? "T" : "-"}`;
    const bucket = map.get(key) ?? {
      taxRateKey: line.taxRateKey,
      taxRate: line.taxRate,
      taxCategory: line.taxCategory,
      netCents: 0,
      taxCents: 0,
      grossCents: 0,
      isTouristTax: line.isTouristTax ?? false,
    };
    bucket.netCents += line.totalCents;
    map.set(key, bucket);
  }
  const buckets = [...map.values()].map((b) => {
    b.taxCents = roundHalfUp(b.netCents * b.taxRate, 0);
    if (currency === "CHF") {
      // Brutto auf 5-Rappen; Steuer ist die Differenz, damit Netto + Steuer = Brutto.
      b.grossCents = roundMoneyCents(b.netCents + b.taxCents, "CHF");
      b.taxCents = b.grossCents - b.netCents;
    } else {
      b.grossCents = b.netCents + b.taxCents;
    }
    return b;
  });
  const netCents = buckets.reduce((s, b) => s + b.netCents, 0);
  const taxCents = buckets.reduce((s, b) => s + b.taxCents, 0);
  return { lines: withTotals, buckets, netCents, taxCents, grossCents: netCents + taxCents };
}