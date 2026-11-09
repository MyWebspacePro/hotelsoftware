import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/auth.js";
import {
  addDays,
  availabilityOverview,
  nightsBetween,
  priceForStay,
  todayIso,
  type ReservationLike,
} from "@hg/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dateToIso = (d: Date) => d.toISOString().slice(0, 10);

const BLOCKING: BookingStatus[] = ["OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"];

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  /** Zimmerplan-Daten: Zimmerzeilen + Reservierungen im Zeitfenster (max. 62 Tage). */
  app.get("/", async (req, reply) => {
    const { from, to } = z
      .object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE) })
      .parse(req.query);
    if (nightsBetween(from, to) > 62) {
      return reply.code(400).send({ error: "Zeitfenster max. 62 Tage" });
    }
    const hotelId = req.user!.hotelId!;
    const days: string[] = [];
    let cursor = from;
    while (cursor < to) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }

    const [rooms, roomTypes, reservations] = await Promise.all([
      prisma.room.findMany({
        where: { hotelId, deletedAt: null },
        include: { roomType: { select: { id: true, name: true, color: true } } },
        orderBy: [{ roomTypeId: "asc" }, { number: "asc" }],
      }),
      prisma.roomType.findMany({ where: { hotelId, deletedAt: null }, orderBy: { name: "asc" } }),
      prisma.reservation.findMany({
        where: {
          hotelId,
          deletedAt: null,
          dateFrom: { lt: isoToDate(to) },
          dateTo: { gt: isoToDate(from) },
        },
        include: {
          // Gast hängt an der Buchung (Reservation hat keine direkte Gast-Relation)
          booking: { select: { guest: { select: { firstName: true, lastName: true } } } },
          roomType: { select: { name: true, color: true } },
          room: { select: { number: true } },
        },
        orderBy: { dateFrom: "asc" },
      }),
    ]);

    return {
      days,
      roomTypes: roomTypes.map((rt) => ({ id: rt.id, name: rt.name, color: rt.color, capacity: rt.capacity })),
      rooms: rooms.map((r) => ({ id: r.id, number: r.number, floor: r.floor, roomTypeId: r.roomTypeId, roomTypeName: r.roomType.name, color: r.roomType.color })),
      reservations: reservations.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        status: r.status,
        dateFrom: dateToIso(r.dateFrom),
        dateTo: dateToIso(r.dateTo),
        adults: r.adults,
        children: r.children,
        priceTotalCents: r.priceTotalCents,
        roomId: r.roomId,
        roomNumber: r.room?.number ?? null,
        roomTypeId: r.roomTypeId,
        roomTypeName: r.roomType.name,
        guestName: r.booking.guest ? `${r.booking.guest.firstName} ${r.booking.guest.lastName}` : "—",
      })),
    };
  });

  /** Verfügbarkeitsübersicht für Buchungsdialoge (inkl. Preisvorschlag). */
  app.get("/availability", async (req, reply) => {
    const { dateFrom, dateTo } = z
      .object({ dateFrom: z.string().regex(DATE_RE), dateTo: z.string().regex(DATE_RE) })
      .parse(req.query);
    const hotelId = req.user!.hotelId!;
    if (dateFrom >= dateTo) return reply.code(400).send({ error: "dateTo muss nach dateFrom liegen" });

    const [roomTypes, rooms, blocking, rules] = await Promise.all([
      prisma.roomType.findMany({ where: { hotelId, deletedAt: null }, orderBy: { name: "asc" } }),
      prisma.room.findMany({ where: { hotelId, deletedAt: null }, select: { roomTypeId: true } }),
      prisma.reservation.findMany({
        where: { hotelId, deletedAt: null, status: { in: BLOCKING }, dateFrom: { lt: isoToDate(dateTo) }, dateTo: { gt: isoToDate(dateFrom) } },
        select: { roomTypeId: true, dateFrom: true, dateTo: true, status: true },
      }),
      prisma.priceRule.findMany({ where: { hotelId, deletedAt: null } }),
    ]);

    const resLike: ReservationLike[] = blocking.map((r) => ({
      roomTypeId: r.roomTypeId,
      dateFrom: dateToIso(r.dateFrom),
      dateTo: dateToIso(r.dateTo),
      status: r.status,
    }));
    const roomCounts: Record<string, number> = {};
    for (const r of rooms) roomCounts[r.roomTypeId] = (roomCounts[r.roomTypeId] ?? 0) + 1;

    const overview = availabilityOverview(resLike, roomTypes.map((rt) => ({ id: rt.id, capacity: rt.capacity })), roomCounts, dateFrom, dateTo);

    return roomTypes.map((rt) => {
      const avail = overview.find((o) => o.roomTypeId === rt.id)!;
      const price = priceForStay(
        dateFrom,
        dateTo,
        rules
          .filter((r) => r.roomTypeId === rt.id)
          .map((r) => ({ id: r.id, dateFrom: dateToIso(r.dateFrom), dateTo: dateToIso(r.dateTo), priceCents: r.priceCents, minStay: r.minStay, stopSell: r.stopSell })),
        rt.basePriceCents,
      );
      return {
        roomTypeId: rt.id,
        name: rt.name,
        color: rt.color,
        capacity: rt.capacity,
        maxExtraBeds: rt.maxExtraBeds,
        totalRooms: avail.totalRooms,
        availableForStay: avail.availableForStay,
        suggestedPriceCents: price.totalCents,
        suggestedPerNightCents: price.nights ? Math.round(price.totalCents / price.nights) : 0,
        nights: price.nights,
        minStayRequired: price.minStayRequired,
        stopSellNights: price.stopSellNights,
      };
    });
  });

  /** Dashboard-Kennzahlen. */
  app.get("/dashboard", async (req) => {
    const hotelId = req.user!.hotelId!;
    const today = todayIso();
    const tomorrow = addDays(today, 1);
    const t0 = isoToDate(today);
    const t1 = isoToDate(tomorrow);

    const [arrivals, departures, inHouse, totalRooms, occupancyRows] = await Promise.all([
      prisma.reservation.count({ where: { hotelId, deletedAt: null, dateFrom: t0, status: { in: ["CONFIRMED", "OFFERED"] } } }),
      prisma.reservation.count({ where: { hotelId, deletedAt: null, dateTo: t0, status: { in: ["CHECKED_IN"] } } }),
      prisma.reservation.count({ where: { hotelId, deletedAt: null, status: "CHECKED_IN", dateFrom: { lt: t1 }, dateTo: { gt: t0 } } }),
      prisma.room.count({ where: { hotelId, deletedAt: null } }),
      prisma.reservation.findMany({
        where: { hotelId, deletedAt: null, status: { in: ["CHECKED_IN", "CONFIRMED"] }, dateFrom: { lt: t1 }, dateTo: { gt: t0 } },
        select: { roomTypeId: true },
      }),
    ]);

    return {
      date: today,
      arrivalsToday: arrivals,
      departuresToday: departures,
      inHouseTonight: inHouse,
      totalRooms,
      occupiedTonight: occupancyRows.length,
      occupancyTonightPct: totalRooms ? Math.round((occupancyRows.length / totalRooms) * 100) : 0,
    };
  });
}
