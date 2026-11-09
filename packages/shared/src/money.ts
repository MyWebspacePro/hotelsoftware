/**
 * Geld-Helfer: Einheitliche Rundung für DACH.
 * EUR/USD: 2 Dezimalstellen, kaufmännisch (round half up).
 * CHF: 0.05-Raster (Rappenrundung), kaufmännisch.
 */
export type Currency = "EUR" | "CHF";

/** Rundet auf `decimals` Stellen, kaufmännisch (half away from zero). */
export function roundHalfUp(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  // Epsilon gegen Float-Fehler (z. B. 2.675 → 2.67 statt 2.68)
  const scaled = value * factor + (value >= 0 ? 1e-9 : -1e-9);
  const rounded = Math.round(Math.abs(scaled)) * Math.sign(scaled);
  return rounded / factor;
}

export function roundMoney(value: number, currency: Currency): number {
  if (currency === "CHF") {
    // 0.05-Raster
    const cents = Math.round(value * 100 + (value >= 0 ? 1e-9 : -1e-9));
    const snapped = Math.round(Math.abs(cents / 5)) * 5 * Math.sign(cents);
    return snapped / 100;
  }
  return roundHalfUp(value, 2);
}

/** Cent-Betrag (CHF: 5-Cent-Raster bereits gerundet). */
export function toMinorUnits(value: number, currency: Currency): number {
  return Math.round(roundMoney(value, currency) * 100);
}

export function formatMoney(value: number, currency: Currency, locale = "de-DE"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    ...(currency === "CHF" ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}),
  }).format(value);
}
