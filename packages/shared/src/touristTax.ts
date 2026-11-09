import { parseIsoDate } from "./dates.js";

/**
 * Kurtaxe-Engine (Beherbergungsabgabe / Ortstaxe / Taxa de séjour).
 * Pro Nacht wird die im Gültigkeitsfenster liegende Saison-Konfiguration
 * angewendet; Altersfreigrenzen (z. B. Tirol: bis 15 Jahre abgabenfrei) und
 * ermäßigte Kindersätze je Konfiguration.
 */
export interface TouristTaxSeason {
  validFrom: string; // ISO, inklusiv
  validTo: string; // ISO, exklusiv
  adultCentsPerNight: number;
  /** Kinder bis einschließlich diesem Alter gelten als Kind (z. B. 15 für Tirol). */
  childUntilAge: number;
  /** Satz pro Kind/Nacht in Cents (0 = abgabenfrei). */
  childCentsPerNight: number;
}

export interface TaxGuest {
  /** Alter in Jahren; null = Erwachsener (volle Rate). */
  age: number | null;
}

export interface TouristTaxNightDetail {
  night: string;
  subtotalCents: number;
  adults: number;
  childrenPaid: number;
  childrenFree: number;
  rateAdultCents: number;
  rateChildCents: number;
  /** Nacht ohne gültige Konfiguration → keine Abgabe. */
  unconfigured: boolean;
}

export interface TouristTaxResult {
  totalCents: number;
  details: TouristTaxNightDetail[];
}

export function computeTouristTax(
  seasons: TouristTaxSeason[],
  nights: string[],
  guests: TaxGuest[],
): TouristTaxResult {
  const details: TouristTaxNightDetail[] = [];
  let totalCents = 0;

  for (const night of nights) {
    const season = seasons.find((s) => s.validFrom <= night && night < s.validTo);
    if (!season) {
      details.push({
        night,
        subtotalCents: 0,
        adults: 0,
        childrenPaid: 0,
        childrenFree: 0,
        rateAdultCents: 0,
        rateChildCents: 0,
        unconfigured: true,
      });
      continue;
    }

    let subtotalCents = 0;
    let adults = 0;
    let childrenPaid = 0;
    let childrenFree = 0;

    for (const guest of guests) {
      const isChild = guest.age !== null && guest.age <= season.childUntilAge;
      if (isChild) {
        const cents = season.childCentsPerNight;
        subtotalCents += cents;
        if (cents === 0) childrenFree += 1;
        else childrenPaid += 1;
      } else {
        subtotalCents += season.adultCentsPerNight;
        adults += 1;
      }
    }

    totalCents += subtotalCents;
    details.push({
      night,
      subtotalCents,
      adults,
      childrenPaid,
      childrenFree,
      rateAdultCents: season.adultCentsPerNight,
      rateChildCents: season.childCentsPerNight,
      unconfigured: false,
    });
  }

  return { totalCents, details };
}

/** Gast-Alter aus Geburtsdatum (ISO) bezogen auf die Nacht. */
export function ageAtNight(birthDateIso: string | null | undefined, night: string): number | null {
  if (!birthDateIso) return null;
  const birth = parseIsoDate(birthDateIso);
  const n = parseIsoDate(night);
  let age = n.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    n.getUTCMonth() < birth.getUTCMonth() ||
    (n.getUTCMonth() === birth.getUTCMonth() && n.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** Standard-Konfiguration Kitzbühel/AT als Beispiel (5,00 €/P/N, < 15 J. frei). */
export const TOURIST_TAX_EXAMPLE_AT: TouristTaxSeason = {
  validFrom: "2026-02-01",
  validTo: "2099-01-01",
  adultCentsPerNight: 500,
  childUntilAge: 15,
  childCentsPerNight: 0,
};
