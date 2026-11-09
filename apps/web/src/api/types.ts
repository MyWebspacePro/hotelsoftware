// Gemeinsame Frontend-Typen (Spiegel der API-Antworten, Phase 1)

export interface RoomType {
  id: string;
  name: string;
  capacity: number;
  maxExtraBeds: number;
  description: string | null;
  basePriceCents: number;
  color: string;
  _count: { rooms: number };
}

export interface Room {
  id: string;
  number: string;
  floor: number | null;
  notes: string | null;
  roomTypeId: string;
  roomType: { id: string; name: string; color: string; capacity: number };
}

export interface RatePlan {
  id: string;
  name: string;
  basis: "NUR_LOGIS" | "UE_F" | "HP";
  cancellationTerms: string | null;
  active: boolean;
}

export interface PriceRule {
  id: string;
  roomTypeId: string;
  name: string | null;
  dateFrom: string;
  dateTo: string;
  priceCents: number;
  minStay: number;
  stopSell: boolean;
  roomType?: { id: string; name: string; color: string };
}

export interface Article {
  id: string;
  name: string;
  category: "FOOD" | "DRINK" | "SPA" | "SKISERVICE" | "OTHER";
  taxRateKey: string;
  unitPriceCents: number;
  chargeToRoom: boolean;
  active: boolean;
}

export interface Guest {
  id: string;
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
  marketingConsent: boolean;
  notes: string | null;
  createdAt: string;
}

export interface ReservationView {
  id: string;
  bookingId: string;
  status: BookingStatusValue;
  dateFrom: string;
  dateTo: string;
  adults: number;
  children: number;
  pricePerNightCents: number;
  priceTotalCents: number;
  notes: string | null;
  roomId: string | null;
  roomTypeId: string;
  ratePlanId: string | null;
  roomType: { id: string; name: string; color: string };
  room: { id: string; number: string } | null;
  ratePlan: { id: string; name: string; basis: string } | null;
}

export type BookingStatusValue =
  | "INQUIRY"
  | "OFFERED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "NO_SHOW";

export interface BookingView {
  id: string;
  status: BookingStatusValue;
  source: string;
  notes: string | null;
  guestId: string | null;
  guest: Guest | null;
  reservations: ReservationView[];
  createdAt: string;
}

export interface CalendarData {
  days: string[];
  roomTypes: { id: string; name: string; color: string; capacity: number }[];
  rooms: { id: string; number: string; floor: number | null; roomTypeId: string; roomTypeName: string; color: string }[];
  reservations: CalReservation[];
}

export interface CalReservation {
  id: string;
  bookingId: string;
  status: BookingStatusValue;
  dateFrom: string;
  dateTo: string;
  adults: number;
  children: number;
  priceTotalCents: number;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string;
  roomTypeName: string;
  guestName: string;
}

export interface AvailabilityRow {
  roomTypeId: string;
  name: string;
  color: string;
  capacity: number;
  maxExtraBeds: number;
  totalRooms: number;
  availableForStay: number;
  suggestedPriceCents: number;
  suggestedPerNightCents: number;
  nights: number;
  minStayRequired: number;
  stopSellNights: number;
}

export interface DashboardStats {
  date: string;
  arrivalsToday: number;
  departuresToday: number;
  inHouseTonight: number;
  totalRooms: number;
  occupiedTonight: number;
  occupancyTonightPct: number;
}

export function eur(cents: number, currency = "EUR"): string {
  return `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
