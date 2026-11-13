import { addDays, eachNight, overlaps } from "./dates.js";

/** Status, die Zimmer/Kapazität blockieren (INQUIRY blockiert bewusst nicht). */
export const BLOCKING_STATUSES = ["OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] as const;

export interface ReservationLike {
  roomTypeId: string;
  dateFrom: string; // ISO
  dateTo: string; // ISO (Abreisetag, exklusiv)
  status: string;
}

/** Externe Sperrung (z. B. iCal-Block des Portals) — belegt eine Einheit. */
export interface BlockLike {
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
}

export interface RoomTypeLike {
  id: string;
  capacity: number;
}

export interface AvailabilityResult {
  roomTypeId: string;
  totalRooms: number;
  /** Freie Einheiten je Nacht (ISO). Kann bei Überbuchung negativ sein. */
  perNight: Record<string, number>;
  /** Minimum über alle Nächte des Aufenthalts — die entscheidende Zahl. */
  availableForStay: number;
  /** Anzahl blockierender Reservierungen im Zeitraum. */
  blockingCount: number;
}

/**
 * Verfügbarkeit eines Zimmertyps für einen Aufenthaltszeitraum.
 * Belegung je Nacht = Reservierungen + externe Blöcke dieses Typs, die die
 * Nacht abdecken; freie Einheiten = totalRooms − belegt (negativ = Überbuchung).
 */
export function availabilityForStay(
  reservations: ReservationLike[],
  roomTypeId: string,
  totalRooms: number,
  dateFrom: string,
  dateTo: string,
  blocks: BlockLike[] = [],
): AvailabilityResult {
  const nights = eachNight(dateFrom, dateTo);
  const perNight: Record<string, number> = {};
  let blockingCount = 0;

  for (const night of nights) {
    perNight[night] = totalRooms;
  }

  for (const res of reservations) {
    if (res.roomTypeId !== roomTypeId) continue;
    if (!isBlocking(res.status)) continue;
    if (!overlaps(dateFrom, dateTo, res.dateFrom, res.dateTo)) continue;
    blockingCount += 1;
    for (const night of eachNight(res.dateFrom, res.dateTo)) {
      if (night in perNight) perNight[night] -= 1;
    }
  }

  for (const block of blocks) {
    if (block.roomTypeId !== roomTypeId) continue;
    if (!overlaps(dateFrom, dateTo, block.dateFrom, block.dateTo)) continue;
    for (const night of eachNight(block.dateFrom, block.dateTo)) {
      if (night in perNight) perNight[night] -= 1;
    }
  }

  const availableForStay = nights.length
    ? Math.min(...nights.map((n) => perNight[n]))
    : totalRooms;

  return { roomTypeId, totalRooms, perNight, availableForStay, blockingCount };
}

/** Verfügbarkeit über mehrere Zimmertypen auf einmal (für Buchungsdialoge). */
export function availabilityOverview(
  reservations: ReservationLike[],
  roomTypes: RoomTypeLike[],
  roomCounts: Record<string, number>,
  dateFrom: string,
  dateTo: string,
  blocks: BlockLike[] = [],
): AvailabilityResult[] {
  return roomTypes.map((rt) =>
    availabilityForStay(reservations, rt.id, roomCounts[rt.id] ?? 0, dateFrom, dateTo, blocks),
  );
}

export function isBlocking(status: string): boolean {
  return (BLOCKING_STATUSES as readonly string[]).includes(status);
}

/** Nacht-Übersicht für einen Kalender: Belegungsanzahl je Tag. */
export function occupancyByDay(
  reservations: ReservationLike[],
  roomTypeId: string,
  from: string,
  to: string,
  blocks: BlockLike[] = [],
): Record<string, number> {
  const out: Record<string, number> = {};
  let cursor = from;
  while (cursor < to) {
    out[cursor] = 0;
    cursor = addDays(cursor, 1);
  }
  for (const res of reservations) {
    if (res.roomTypeId !== roomTypeId || !isBlocking(res.status)) continue;
    for (const night of eachNight(res.dateFrom, res.dateTo)) {
      if (night in out) out[night] += 1;
    }
  }
  for (const block of blocks) {
    if (block.roomTypeId !== roomTypeId) continue;
    for (const night of eachNight(block.dateFrom, block.dateTo)) {
      if (night in out) out[night] += 1;
    }
  }
  return out;
}