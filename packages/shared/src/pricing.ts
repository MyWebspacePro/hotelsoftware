import { eachNight, overlaps } from "./dates.js";

export interface PriceRuleLike {
  id: string;
  dateFrom: string; // ISO, inklusiv
  dateTo: string; // ISO, exklusiv
  priceCents: number;
  minStay?: number;
  stopSell?: boolean;
}

export interface PriceResult {
  perNightCents: Record<string, number>;
  totalCents: number;
  nights: number;
  /** Gültige Regel je Nacht, falls vorhanden. */
  appliedRuleIds: Record<string, string>;
  minStayRequired: number;
  stopSellNights: number;
}

/**
 * Preis für einen Aufenthalt: Basispreis, sofern keine Regel die Nacht abdeckt;
 * decken mehrere Regeln eine Nacht, gilt die spezifischste (längster Zeitraum,
 * bei Gleichstand: späterer Beginn).
 */
export function priceForStay(
  dateFrom: string,
  dateTo: string,
  rules: PriceRuleLike[],
  basePriceCents: number,
): PriceResult {
  const nights = eachNight(dateFrom, dateTo);
  const perNightCents: Record<string, number> = {};
  const appliedRuleIds: Record<string, string> = {};
  let minStayRequired = 1;
  let stopSellNights = 0;

  for (const night of nights) {
    const covering = rules.filter(
      (r) => r.dateFrom <= night && night < r.dateTo,
    );
    const winner = covering.sort(
      (a, b) =>
        // Spezifischer zuerst: kürzere Regel schlägt lange Saison; bei Gleichstand späterer Beginn
        nightsBetweenIso(a.dateFrom, a.dateTo) - nightsBetweenIso(b.dateFrom, b.dateTo) ||
        (a.dateFrom < b.dateFrom ? 1 : -1),
    )[0];
    perNightCents[night] = winner ? winner.priceCents : basePriceCents;
    if (winner) {
      appliedRuleIds[night] = winner.id;
      minStayRequired = Math.max(minStayRequired, winner.minStay ?? 1);
      if (winner.stopSell) stopSellNights += 1;
    }
  }

  return {
    perNightCents,
    totalCents: Object.values(perNightCents).reduce((sum, c) => sum + c, 0),
    nights: nights.length,
    appliedRuleIds,
    minStayRequired,
    stopSellNights,
  };
}

function nightsBetweenIso(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

/** Durchschnittspreis pro Nacht (ADR) in Cents, gerundet. */
export function averageNightlyCents(result: PriceResult): number {
  if (result.nights === 0) return 0;
  return Math.round(result.totalCents / result.nights);
}
