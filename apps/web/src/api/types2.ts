// Phase-2-Typen: Folio, Rechnungen, Zahlungen, Tagesabschluss, Kurtaxe

import type { BookingStatusValue, Guest } from "./types";

export interface FolioEntry {
  id: string;
  folioId: string;
  kind: "CHARGE" | "CREDIT" | "DISCOUNT";
  articleId: string | null;
  text: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  taxRateKey: string;
  taxRate: number;
  taxCategory: string;
  isTouristTax: boolean;
  nightDate: string | null;
  source: string;
  invoiceId: string | null;
}

export interface FolioPayment {
  id: string;
  method: string;
  amountCents: number;
  date: string;
  reference: string | null;
  note: string | null;
  invoiceId: string | null;
}

export interface FolioAccount {
  id: string;
  bookingId: string | null;
  type: string;
  title: string | null;
  open: boolean;
  entries: FolioEntry[];
  payments: FolioPayment[];
  booking: { id: string; status: BookingStatusValue; guest: Guest | null } | null;
}

export interface InvoiceLine {
  id: string;
  position: number;
  text: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  taxRateKey: string;
  taxRate: number;
  taxCategory: string;
  isTouristTax: boolean;
}

export interface TaxBucket {
  taxRateKey: string;
  taxRate: number;
  taxCategory: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  isTouristTax: boolean;
}

export interface InvoicePayment {
  id: string;
  method: string;
  amountCents: number;
  date: string;
  reference: string | null;
}

export interface InvoiceView {
  id: string;
  number: string;
  series: string;
  type: "STANDARD" | "ADVANCE" | "CREDIT" | "CONSOLIDATED";
  status: "ISSUED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  guestName: string | null;
  guest: Guest | null;
  currency: string;
  date: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxBreakdown: TaxBucket[];
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  hotel: { name: string; address: string | null; zip: string | null; city: string | null; country: string };
  bookingId: string | null;
}

export interface InvoiceListItem {
  id: string;
  number: string;
  type: string;
  status: string;
  guestName: string | null;
  currency: string;
  date: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  bookingId: string | null;
}

export interface DayClosingView {
  id: string;
  date: string;
  totals: { payments?: { method: string; amountCents: number; count: number }[] };
  taxTotals: { taxRateKey: string; taxRate: number; netCents: number; taxCents: number }[];
  folioTotals: { chargeCents: number; creditCents: number };
  closedAt: string;
}

export interface ClosingPaymentRow {
  id: string;
  method: string;
  amountCents: number;
  date: string;
  reference: string | null;
  note: string | null;
  invoice: { id: string; number: string; guestName: string | null } | null;
  folio: { id: string; bookingId: string | null; booking: { guest: Guest | null } | null } | null;
}

export interface TouristTaxConfigView {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  adultCentsPerNight: number;
  childUntilAge: number;
  childCentsPerNight: number;
}

export interface AccountMappingView {
  id: string;
  format: "DATEV" | "GENERIC";
  mapping: { debtorAccount: string; accounts: Record<string, string> };
}

// ── Phase 3: Meldewesen & DSGVO ──────────────────────────────

export interface RegistrationProfileView {
  profile: {
    country: string;
    label: string;
    foreignOnly: boolean;
    requiredFields: string[];
    retentionDays: number;
    legalNote: string;
  };
  fieldLabels: Record<string, string>;
  hotelCountry: string;
}

export interface RegistrationRecordView {
  id: string;
  reservationId: string;
  guestId: string;
  country: string;
  fullName: string;
  birthDate: string | null;
  nationality: string | null;
  idType: string | null;
  idNumber: string | null;
  address: string | null;
  arrival: string;
  departure: string;
  status: "DRAFT" | "SUBMITTED";
  foreignGuest: boolean;
  retentionUntil: string;
  anonymizedAt: string | null;
  exportedAt: string | null;
  guest: { id: string; email: string | null; phone: string | null } | null;
  reservation: { id: string; adults: number; children: number } | null;
}

export interface RegistrationExportView {
  id: string;
  type: string;
  periodFrom: string | null;
  periodTo: string | null;
  recordCount: number;
  createdAt: string;
}

export interface RetentionRunView {
  id: string;
  executedAt: string;
  registrationsAnonymized: number;
  guestsAnonymized: number;
}
