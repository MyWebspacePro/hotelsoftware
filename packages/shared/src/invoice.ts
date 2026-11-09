import { roundHalfUp } from "./money.js";

/**
 * Rechnungssummen: mehrwertsteuerliche Gruppierung nach Steuerschlüssel
 * (mehrere Sätze pro Rechnung), Netto/Steuer/Brutto je Bucket + Summen.
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

export function invoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  const withTotals = lines.map((l) => ({ ...l, totalCents: l.qty * l.unitPriceCents }));
  const map = new Map<string, TaxBucket>();
  for (const line of withTotals) {
    const key = line.taxRateKey;
    const bucket = map.get(key) ?? {
      taxRateKey: key,
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
    b.grossCents = b.netCents + b.taxCents;
    return b;
  });
  const netCents = buckets.reduce((s, b) => s + b.netCents, 0);
  const taxCents = buckets.reduce((s, b) => s + b.taxCents, 0);
  return { lines: withTotals, buckets, netCents, taxCents, grossCents: netCents + taxCents };
}
