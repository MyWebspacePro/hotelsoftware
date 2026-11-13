import { addDays, addYears } from "./dates.js";
import type { CountryCode } from "./countries.js";

/**
 * Meldewesen-Profile DACH (Stand Recherche 2026):
 * DE: Meldeschein nach §29/30 BMG — seit 1.1.2025 (4. Bürokratieentlastungsgesetz)
 *     im Wesentlichen nur noch für ausländische Gäste; Aufbewahrung 1 Jahr ab Abreise,
 *     danach Vernichtung binnen 3 Monaten.
 * AT: Gästeblatt (Beherbergungsgesetz) + monatliche Meldung an Statistik Austria
 *     (Beherbergungsstatistikgesetz 2021).
 * CH: Meldepflicht für ausländische Gäste nach AIG/VZAE an Kanton/Fremdenpolizei;
 *     Meldescheine mind. 5 Jahre aufbewahren.
 */
export interface RegistrationProfile {
  country: CountryCode;
  label: string;
  /** true = nur ausländische Gäste melden (DE/CH), false = alle Gäste (AT). */
  foreignOnly: boolean;
  /** Pflichtfeld-Schlüssel: fullName, birthDate, nationality, idType, idNumber, address. */
  requiredFields: string[];
  /** Aufbewahrungsfrist in Kalenderjahren ab Abreise. */
  retentionYears: number;
  /** Abgeleitete Tag-Zahl (nur zur Anzeige; die Frist rechnet in Kalenderjahren). */
  retentionDays: number;
  legalNote: string;
}

const YEARS_TO_DAYS = (years: number, reference = "2026-03-01"): number =>
  Math.round((Date.parse(addYears(reference, years)) - Date.parse(reference)) / 86400000);

export const REGISTRATION_PROFILES: Record<CountryCode, RegistrationProfile> = {
  DE: {
    country: "DE",
    label: "Meldeschein (DE, §29/30 BMG)",
    foreignOnly: true,
    requiredFields: ["fullName", "birthDate", "nationality", "idType", "idNumber", "address"],
    retentionYears: 1,
    retentionDays: YEARS_TO_DAYS(1),
    legalNote: "§30 Abs. 4 BMG: Meldescheine 1 Jahr aufbewahren, danach binnen 3 Monaten vernichten.",
  },
  AT: {
    country: "AT",
    label: "Gästeblatt (AT, Beherbergungsgesetz)",
    foreignOnly: false,
    requiredFields: ["fullName", "birthDate", "nationality", "address", "idType"],
    retentionYears: 2,
    retentionDays: YEARS_TO_DAYS(2),
    legalNote: "Gästeblatt-Pflicht; monatliche Beherbergungsstatistik an Statistik Austria (BStatG 2021).",
  },
  CH: {
    country: "CH",
    label: "Gästekontrolle (CH, AIG/VZAE)",
    foreignOnly: true,
    requiredFields: ["fullName", "birthDate", "nationality", "idType", "idNumber"],
    retentionYears: 5,
    retentionDays: YEARS_TO_DAYS(5),
    legalNote: "Meldepflicht ausländische Gäste (AIG); Meldescheine mind. 5 Jahre aufbewahren.",
  },
};

export const FIELD_LABELS: Record<string, string> = {
  fullName: "Vollständiger Name",
  birthDate: "Geburtsdatum",
  nationality: "Staatsangehörigkeit",
  idType: "Ausweisart",
  idNumber: "Ausweisnummer",
  address: "Anschrift (Straße, PLZ, Ort)",
};

export interface RegistrationDataLike {
  fullName: string | null;
  birthDate: string | null; // ISO
  nationality: string | null;
  idType: string | null;
  idNumber: string | null;
  address: string | null;
}

/** Fehlende Pflichtfelder laut Profil (deutsche Labels). */
export function missingFields(data: RegistrationDataLike | null | undefined, profile: RegistrationProfile): string[] {
  const source = (data ?? {}) as unknown as Record<string, unknown>;
  const missing: string[] = [];
  for (const field of profile.requiredFields) {
    const value = source[field];
    const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (!text) missing.push(FIELD_LABELS[field] ?? field);
  }
  return missing;
}

/** Löschfrist: Abreise + retentionYears (Kalenderjahre, ISO). */
export function retentionUntil(departureIso: string, profile: RegistrationProfile): string {
  if (!profile.retentionYears) return addDays(departureIso, profile.retentionDays);
  return addYears(departureIso, profile.retentionYears);
}

/** Muss dieser Gast gemeldet werden? (foreignOnly-Profile: nur Nicht-Inländer) */
export function mustBeRegistered(guestCountry: string | null | undefined, hotelCountry: CountryCode, profile: RegistrationProfile): boolean {
  if (!profile.foreignOnly) return true;
  const guestC = (guestCountry ?? "").trim().toUpperCase();
  return guestC !== hotelCountry;
}