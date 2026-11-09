/**
 * DSGVO-Helfer: Anonymisierung von Gastdaten + Löschentscheidung.
 * Trennung der Fristen: Meldeschein-Daten (kurz, siehe registration.ts) vs.
 * Gästeprofile/Marketing (konfigurierbar, Standard 3 Jahre ohne Aktivität).
 */
export interface AnonymizableGuest {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  nationality: string | null;
  birthDate: string | null;
  idType: string | null;
  idNumber: string | null;
  notes: string | null;
}

export interface AnonymizedGuestFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  nationality: string;
  birthDate: string;
  idType: string;
  idNumber: string;
  notes: string;
}

/** Ersetzt personenbezogene Felder — Datensatz bleibt für Statistik/Archiv erhalten. */
export function anonymizedGuestFields(reference: string): AnonymizedGuestFields {
  return {
    firstName: "Anonymisiert",
    lastName: `Gast-${reference}`,
    email: "",
    phone: "",
    address: "",
    zip: "",
    city: "",
    country: "",
    nationality: "",
    birthDate: "",
    idType: "",
    idNumber: "",
    notes: "",
  };
}

/** Personenbezug des Meldescheins entfernen (Frist abgelaufen). */
export function anonymizedRegistrationFields(): {
  fullName: string;
  birthDate: string;
  nationality: string;
  idType: string;
  idNumber: string;
  address: string;
} {
  return { fullName: "Anonymisiert", birthDate: "", nationality: "", idType: "", idNumber: "", address: "" };
}

export interface RetentionDecisionInput {
  /** ISO des letzten Abreisetags (null = nie übernachtet). */
  lastDeparture: string | null;
  hasActiveOrFutureStay: boolean;
  retentionDays: number;
  todayIso: string;
}

/** Gästeprofil anonymisieren, wenn Frist abgelaufen und keine künftigen Aufenthalte. */
export function shouldAnonymizeGuest(input: RetentionDecisionInput): boolean {
  if (input.hasActiveOrFutureStay) return false;
  if (!input.lastDeparture) return false;
  const cutoff = new Date(`${input.todayIso}T00:00:00.000Z`).getTime() - input.retentionDays * 86400000;
  return new Date(`${input.lastDeparture}T00:00:00.000Z`).getTime() < cutoff;
}
