import { addDays } from "./dates.js";
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
  /** Aufbewahrungstage ab Abreise (Lösch-/Anonymisierungsfrist). */
  retentionDays: number;
  legalNote: string;
}

export const REGISTRATION_PROFILES: Record<CountryCode, RegistrationProfile> = {
  DE: {
    country: "DE",
    label: "Meldeschein (DE, §29/30 BMG)",
    foreignOnly: true,
    requiredFields: ["fullName", "birthDate", "nationality", "idType", "idNumber", "address"],
    retentionDays: 365,
    legalNote: "§30 Abs. 4 BMG: Meldescheine 1 Jahr aufbewahren, danach binnen 3 Monaten vernichten.",
  },
  AT: {
    country: "AT",
    label: "Gästeblatt (AT, Beherbergungsgesetz)",
    foreignOnly: false,
    requiredFields: ["fullName", "birthDate", "nationality", "address", "idType"],
    retentionDays: 730,
    legalNote: "Gästeblatt-Pflicht; monatliche Beherbergungsstatistik an Statistik Austria (BStatG 2021).",
  },
  CH: {
    country: "CH",
    label: "Gästekontrolle (CH, AIG/VZAE)",
    foreignOnly: true,
    requiredFields: ["fullName", "birthDate", "nationality", "idType", "idNumber"],
    retentionDays: 1825,
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
export function missingFields(data: RegistrationDataLike, profile: RegistrationProfile): string[] {
  const missing: string[] = [];
  for (const field of profile.requiredFields) {
    const value = (data as unknown as Record<string, string | null>)[field];
    if (!value || value.trim() === "") missing.push(FIELD_LABELS[field] ?? field);
  }
  return missing;
}

/** Löschfrist: Abreise + retentionDays (ISO). */
export function retentionUntil(departureIso: string, profile: RegistrationProfile): string {
  return addDays(departureIso, profile.retentionDays);
}

/** Muss dieser Gast gemeldet werden? (foreignOnly-Profile: nur Nicht-Inländer) */
export function mustBeRegistered(guestCountry: string | null | undefined, hotelCountry: CountryCode, profile: RegistrationProfile): boolean {
  if (!profile.foreignOnly) return true;
  const guestC = (guestCountry ?? "").trim().toUpperCase();
  return guestC !== hotelCountry;
}
