/**
 * FiBu-Export: DATEV-kompatibler Buchungsstapel (CSV, DE/AT) und generischer
 * Export (CH & sonstige Programme ohne DATEV). Beide arbeiten auf denselben
 * Buckets einer Rechnung; die Konten kommen aus dem AccountMapping.
 */
export interface FibuBucketRow {
  invoiceNumber: string;
  date: string; // ISO
  currency: string;
  text: string;
  taxRate: number;
  taxCategory: "LOGIS" | "FOOD" | "OTHER";
  isTouristTax: boolean;
  netCents: number;
  grossCents: number;
}

export interface FibuMapping {
  /** Kategorie/Schlüssel → { debit: Debitor-Konto, credit: Erlöskonto }. */
  debtorAccount: string;
  accounts: Record<string, string>; // "LOGIS"|"FOOD"|"OTHER"|"TOURIST_TAX" → Erlöskonto
}

export const DEFAULT_MAPPING_DATEV: FibuMapping = {
  debtorAccount: "10000",
  accounts: { LOGIS: "6200", FOOD: "6300", OTHER: "6400", TOURIST_TAX: "6600" },
};

export const DEFAULT_MAPPING_GENERIC: FibuMapping = {
  debtorAccount: "1100",
  accounts: { LOGIS: "3000", FOOD: "3100", OTHER: "3200", TOURIST_TAX: "3300" },
};

function accountFor(mapping: FibuMapping, row: FibuBucketRow): string {
  if (row.isTouristTax) return mapping.accounts.TOURIST_TAX ?? mapping.accounts.OTHER;
  return mapping.accounts[row.taxCategory] ?? mapping.accounts.OTHER;
}

function taxCode(rate: number): string {
  // DATEV-übliche Kurzform als Klartext (echte USt-Schlüssel konfigurierbar bleiben)
  const pct = Math.round(rate * 1000) / 10;
  return `${String(pct).replace(".", ",")}USt`;
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** DATEV-Buchungsstapel (vereinfacht, semikolongetrennt, Euro/Beträge mit Komma). */
export function buildDatevCsv(rows: FibuBucketRow[], mapping: FibuMapping = DEFAULT_MAPPING_DATEV): string {
  const lines = [
    "Buchungstag;Belegfeld 1;Buchungstext;Sollkonto;Habenkonto;Umsatz;Steuer-Kz;Währung",
  ];
  for (const row of rows) {
    const amount = (row.grossCents / 100).toFixed(2).replace(".", ",");
    lines.push(
      [
        row.date,
        row.invoiceNumber,
        csvEscape(row.text),
        mapping.debtorAccount,
        accountFor(mapping, row),
        amount,
        taxCode(row.taxRate),
        row.currency,
      ].join(";"),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** Generischer Export (CH & sonst): eine Zeile je Bucket inkl. Steueraufschlüsselung. */
export function buildGenericCsv(rows: FibuBucketRow[], mapping: FibuMapping = DEFAULT_MAPPING_GENERIC): string {
  const lines = [
    "Datum;Beleg-Nr;Debitor;Erlöskonto;Kategorie;Netto;Steuer;Brutto;Währung;Text",
  ];
  for (const row of rows) {
    const f = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    lines.push(
      [
        row.date,
        row.invoiceNumber,
        mapping.debtorAccount,
        accountFor(mapping, row),
        row.isTouristTax ? "TOURIST_TAX" : row.taxCategory,
        f(row.netCents),
        f(row.grossCents - row.netCents),
        f(row.grossCents),
        row.currency,
        csvEscape(row.text),
      ].join(";"),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
