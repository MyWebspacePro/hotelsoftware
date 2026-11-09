/**
 * DACH-Länderkonfiguration: Währung + USt-Matrix (Stand: Recherche 2026).
 * Sätze sind niemals hartkodiert im Code — hier ist die Referenz-Default-Config,
 * die im System pro Hotel überschreibbar/erweiterbar ist (TaxRate-Tabelle).
 */
export type CountryCode = "DE" | "AT" | "CH";

export type VatCategory = "LOGIS" | "FOOD" | "OTHER";

export interface VatRate {
  /** Stabiler Schlüssel für Rechnungszeilen (z. B. "DE_LOGIS_7"). */
  key: string;
  label: string;
  rate: number; // 0.07 = 7 %
  category: VatCategory;
}

export interface CountryConfig {
  currency: "EUR" | "CHF";
  locale: string;
  vatRates: VatRate[];
}

export const COUNTRY_DEFAULTS: Record<CountryCode, CountryConfig> = {
  DE: {
    currency: "EUR",
    locale: "de-DE",
    vatRates: [
      { key: "DE_LOGIS_7", label: "Logis 7 %", rate: 0.07, category: "LOGIS" },
      { key: "DE_SPEISEN_7", label: "Speisen 7 %", rate: 0.07, category: "FOOD" },
      { key: "DE_STD_19", label: "USt 19 % (Sonstiges/Getränke)", rate: 0.19, category: "OTHER" },
    ],
  },
  AT: {
    currency: "EUR",
    locale: "de-AT",
    vatRates: [
      { key: "AT_LOGIS_10", label: "Logis 10 %", rate: 0.1, category: "LOGIS" },
      { key: "AT_SPEISEN_10", label: "Speisen/Getränke 10 %", rate: 0.1, category: "FOOD" },
      { key: "AT_STD_20", label: "USt 20 % (Sonstiges)", rate: 0.2, category: "OTHER" },
    ],
  },
  CH: {
    currency: "CHF",
    locale: "de-CH",
    vatRates: [
      { key: "CH_LOGIS_38", label: "Beherbergung 3,8 %", rate: 0.038, category: "LOGIS" },
      { key: "CH_GASTRO_81", label: "Gastronomie 8,1 %", rate: 0.081, category: "FOOD" },
      { key: "CH_TAKEAWAY_26", label: "Take-away 2,6 %", rate: 0.026, category: "FOOD" },
    ],
  },
};

export function countryDefaults(code: CountryCode): CountryConfig {
  return COUNTRY_DEFAULTS[code];
}
