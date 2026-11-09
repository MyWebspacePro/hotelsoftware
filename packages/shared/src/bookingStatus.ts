/**
 * Buchungs-Statusmaschine (Phase 1): Anfrage → Angebot → Bestätigung →
 * Check-in → Check-out; Storno/No-Show aus laufenden Zuständen.
 */
export type BookingStatusValue =
  | "INQUIRY"
  | "OFFERED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "NO_SHOW";

const TRANSITIONS: Record<BookingStatusValue, BookingStatusValue[]> = {
  INQUIRY: ["OFFERED", "CONFIRMED", "CANCELLED"],
  OFFERED: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["CHECKED_OUT"],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: BookingStatusValue, to: BookingStatusValue): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: BookingStatusValue): BookingStatusValue[] {
  return TRANSITIONS[from] ?? [];
}

export const STATUS_LABELS: Record<BookingStatusValue, string> = {
  INQUIRY: "Anfrage",
  OFFERED: "Angebot",
  CONFIRMED: "Bestätigt",
  CHECKED_IN: "Angereist",
  CHECKED_OUT: "Abgereist",
  CANCELLED: "Storniert",
  NO_SHOW: "No-Show",
};

export const STATUS_COLORS: Record<BookingStatusValue, string> = {
  INQUIRY: "#f59e0b",
  OFFERED: "#3b82f6",
  CONFIRMED: "#22c55e",
  CHECKED_IN: "#8b5cf6",
  CHECKED_OUT: "#64748b",
  CANCELLED: "#ef4444",
  NO_SHOW: "#f97316",
};

/** Status, die als "belegt" im Haus gelten (durchgängig pro Nacht). */
export function isOccupied(status: BookingStatusValue): boolean {
  return status === "CHECKED_IN" || status === "CHECKED_OUT" || status === "CONFIRMED";
}
