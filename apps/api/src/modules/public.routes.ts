import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { allowRequest } from "../lib/ratelimit.js";
import {
  buildIcalCalendar,
  nightsBetween,
  priceForStay,
  todayIso,
  type ReservationLike,
} from "@hg/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dateToIso = (d: Date) => d.toISOString().slice(0, 10);

const BLOCKING = ["OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] as const;

const availabilitySchema = z.object({
  dateFrom: z.string().regex(DATE_RE),
  dateTo: z.string().regex(DATE_RE),
  adults: z.coerce.number().int().min(1).max(10).default(2),
  children: z.coerce.number().int().min(0).max(10).default(0),
});

const inquirySchema = z.object({
  dateFrom: z.string().regex(DATE_RE),
  dateTo: z.string().regex(DATE_RE),
  adults: z.number().int().min(1).max(10).default(2),
  children: z.number().int().min(0).max(10).default(0),
  roomTypeId: z.string().min(1),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().max(60).optional().or(z.literal("")),
  message: z.string().max(2000).optional().or(z.literal("")),
  arrivalTime: z.string().max(20).optional().or(z.literal("")),
  // Honeypot gegen Bots: Feld bleibt im UI unsichtbar und muss leer bleiben
  company: z.string().max(200).optional().or(z.literal("")),
});

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  // Bewusst KEIN authenticate: öffentliche Gast-Endpunkte

  /** Öffentliche Hotel-Infos + Zimmertypen für die Anfrage-Seite. */
  app.get("/hotel", async () => {
    const hotel = await prisma.hotel.findFirst({
      where: { deletedAt: null },
      include: { roomTypes: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
    });
    if (!hotel) return { hotel: null };
    return {
      hotel: {
        name: hotel.name,
        city: hotel.city,
        country: hotel.country,
        currency: hotel.currency,
        roomTypes: hotel.roomTypes.map((rt) => ({
          id: rt.id,
          name: rt.name,
          capacity: rt.capacity,
          maxExtraBeds: rt.maxExtraBeds,
          description: rt.description,
        })),
      },
    };
  });

  /** Verfügbarkeit + Preisvorschlag für einen Zeitraum (Rate-limited). */
  app.post("/availability", async (req, reply) => {
    if (!allowRequest(`avail|${req.ip}`, 30, 60_000)) {
      return reply.code(429).send({ error: "Zu viele Anfragen — bitte kurz warten" });
    }
    const { dateFrom, dateTo, adults, children } = availabilitySchema.parse(req.body);
    if (dateFrom >= dateTo) return reply.code(400).send({ error: "Abreise muss nach der Anreise liegen" });
    if (nightsBetween(dateFrom, dateTo) > 30) {
      return reply.code(400).send({ error: "Zeitraum max. 30 Nächte" });
    }

    const hotel = await prisma.hotel.findFirst({ where: { deletedAt: null } });
    if (!hotel) return reply.code(404).send({ error: "Hotel nicht gefunden" });
    const hotelId = hotel.id;

    const [roomTypes, rooms, blocking, rules] = await Promise.all([
      prisma.roomType.findMany({ where: { hotelId, deletedAt: null }, orderBy: { name: "asc" } }),
      prisma.room.findMany({ where: { hotelId, deletedAt: null }, select: { roomTypeId: true } }),
      prisma.reservation.findMany({
        where: {
          hotelId, deletedAt: null, status: { in: [...BLOCKING] },
          dateFrom: { lt: isoToDate(dateTo) }, dateTo: { gt: isoToDate(dateFrom) },
        },
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

    const guestCount = adults + children;
    const results = [];
    for (const rt of roomTypes) {
      const total = roomCounts[rt.id] ?? 0;
      const blocked = resLike.filter((r) => r.roomTypeId === rt.id).length;
      const available = Math.max(0, total - blocked);
      const fitsGuests = rt.capacity + rt.maxExtraBeds >= guestCount;
      const price = priceForStay(
        dateFrom,
        dateTo,
        rules
          .filter((r) => r.roomTypeId === rt.id)
          .map((r) => ({ id: r.id, dateFrom: dateToIso(r.dateFrom), dateTo: dateToIso(r.dateTo), priceCents: r.priceCents, minStay: r.minStay, stopSell: r.stopSell })),
        rt.basePriceCents,
      );
      results.push({
        roomTypeId: rt.id,
        name: rt.name,
        description: rt.description,
        capacity: rt.capacity,
        maxExtraBeds: rt.maxExtraBeds,
        fitsGuests,
        available,
        totalRooms: total,
        availableForStay: fitsGuests ? available : 0,
        nights: price.nights,
        suggestedTotalCents: price.totalCents,
        suggestedPerNightCents: price.nights ? Math.round(price.totalCents / price.nights) : 0,
        minStayRequired: price.minStayRequired,
        stopSellNights: price.stopSellNights,
      });
    }
    return { hotel: { name: hotel.name, currency: hotel.currency }, dateFrom, dateTo, nights: nightsBetween(dateFrom, dateTo), roomTypes: results };
  });

  /** Buchungsanfrage eines Gastes → Booking INQUIRY (Quelle WEBSITE_REQUEST) im Backoffice. */
  app.post("/inquiry", async (req, reply) => {
    if (!allowRequest(`inquiry|${req.ip}`, 10, 60 * 60_000)) {
      return reply.code(429).send({ error: "Zu viele Anfragen — bitte später erneut versuchen" });
    }
    const body = inquirySchema.parse(req.body);

    // Honeypot gefüllt → Bt: Erfolg vortäuschen, nichts speichern
    if (body.company && body.company.trim().length > 0) {
      return { ok: true, reference: "OK" };
    }

    if (body.dateFrom >= body.dateTo) return reply.code(400).send({ error: "Abreise muss nach der Anreise liegen" });
    const nights = nightsBetween(body.dateFrom, body.dateTo);
    if (nights < 1 || nights > 30) return reply.code(400).send({ error: "Zeitraum 1–30 Nächte" });
    if (body.dateFrom < todayIso()) return reply.code(400).send({ error: "Anreise darf nicht in der Vergangenheit liegen" });

    const hotel = await prisma.hotel.findFirst({ where: { deletedAt: null } });
    if (!hotel) return reply.code(404).send({ error: "Hotel nicht gefunden" });
    const hotelId = hotel.id;

    const roomType = await prisma.roomType.findFirst({
      where: { id: body.roomTypeId, hotelId, deletedAt: null },
    });
    if (!roomType) return reply.code(404).send({ error: "Zimmertyp nicht gefunden" });

    // Verfügbarkeit hart prüfen (INQUIRY blockiert zwar nicht, aber voll = voll)
    const blocked = await prisma.reservation.count({
      where: {
        hotelId, deletedAt: null, roomTypeId: roomType.id, status: { in: [...BLOCKING] },
        dateFrom: { lt: isoToDate(body.dateTo) }, dateTo: { gt: isoToDate(body.dateFrom) },
      },
    });
    const total = await prisma.room.count({ where: { hotelId, roomTypeId: roomType.id, deletedAt: null } });
    if (blocked >= total) {
      return reply.code(409).send({ error: "Dieser Zimmertyp ist im gewählten Zeitraum leider ausgebucht" });
    }

    // Preisvorschlag (unverbindlich)
    const rules = await prisma.priceRule.findMany({ where: { hotelId, roomTypeId: roomType.id, deletedAt: null } });
    const price = priceForStay(
      body.dateFrom,
      body.dateTo,
      rules.map((r) => ({ id: r.id, dateFrom: dateToIso(r.dateFrom), dateTo: dateToIso(r.dateTo), priceCents: r.priceCents, minStay: r.minStay, stopSell: r.stopSell })),
      roomType.basePriceCents,
    );

    // Gast: bei bestehender E-Mail wiederverwenden, sonst neu anlegen
    let guest = await prisma.guest.findFirst({
      where: { hotelId, email: body.email, deletedAt: null },
    });
    if (!guest) {
      guest = await prisma.guest.create({
        data: {
          hotelId,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone || null,
          notes: "Kontakt via Website-Buchungsanfrage",
        },
      });
    }

    const noteParts: string[] = [];
    if (body.message) noteParts.push(`Nachricht: ${body.message}`);
    if (body.arrivalTime) noteParts.push(`Gewünschte Anreisezeit: ${body.arrivalTime}`);
    noteParts.push("Anfrage via Website");

    const booking = await prisma.booking.create({
      data: {
        hotelId,
        status: "INQUIRY",
        source: "WEBSITE_REQUEST",
        guestId: guest.id,
        channelRef: "WEB",
        notes: noteParts.join(" | "),
        reservations: {
          create: {
            hotelId,
            status: "INQUIRY",
            roomTypeId: roomType.id,
            roomId: null, // Zimmer wird bei Bestätigung zugeteilt
            dateFrom: isoToDate(body.dateFrom),
            dateTo: isoToDate(body.dateTo),
            adults: body.adults,
            children: body.children,
            pricePerNightCents: price.nights ? Math.round(price.totalCents / price.nights) : 0,
            priceTotalCents: price.totalCents,
            notes: "Unverbindliche Anfrage — Preis als Vorschlag",
          },
        },
      },
    });

    await writeAudit({
      hotelId,
      userId: null,
      entity: "Booking",
      entityId: booking.id,
      action: "PUBLIC_INQUIRY",
      after: { email: body.email, dateFrom: body.dateFrom, dateTo: body.dateTo, roomType: roomType.name },
    });

    return {
      ok: true,
      reference: booking.id.slice(-8).toUpperCase(),
      nights,
      suggestedTotalCents: price.totalCents,
    };
  });

  // ── iCal-Export-Feeds (Tokens statt Login) ─────────────────

  app.get("/ical/:token", async (req, reply) => {
    const params = req.params as Record<string, string>;
    const connection = await prisma.channelConnection.findFirst({
      where: { exportToken: params.token },
    });
    if (!connection || !connection.active || connection.direction === "IMPORT") {
      return reply.code(404).send({ error: "Feed nicht gefunden" });
    }

    const hotelId = connection.hotelId;
    const today = todayIso();
    const reservations = await prisma.reservation.findMany({
      where: {
        hotelId,
        deletedAt: null,
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
        dateTo: { gte: isoToDate(today) }, // Zukünftige + laufende Aufenthalte
        ...(connection.roomTypeId ? { roomTypeId: connection.roomTypeId } : {}),
      },
      include: {
        booking: { include: { guest: true } },
        room: { select: { number: true } },
        roomType: { select: { name: true } },
      },
      orderBy: { dateFrom: "asc" },
    });

    const hotel = await prisma.hotel.findFirst({ where: { id: hotelId } });
    const events = reservations.map((r) => ({
      uid: `hg-${r.id}@hotelguru`,
      summary: r.booking.guest ? `${r.booking.guest.firstName} ${r.booking.guest.lastName}` : "Gast",
      description: [
        r.roomType.name,
        r.room ? `Zimmer ${r.room.number}` : null,
        `${r.adults} Erw./${r.children} Ki.`,
        r.booking.source === "ICAL" ? "(Portal-Buchung)" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      dateFrom: dateToIso(r.dateFrom),
      dateTo: dateToIso(r.dateTo),
    }));

    reply.header("Content-Type", "text/calendar; charset=utf-8");
    reply.header("Content-Disposition", `inline; filename="hotelguru-${connection.id}.ics"`);
    return buildIcalCalendar(events, hotel?.name ?? "HotelGuru Kalender");
  });

  /** Statischer Demo-Feed für Demo-Verbindungen (liest sich selbst beim Sync). */
  app.get("/ical/demo-feed", async (_req, reply) => {
    const d = (offset: number) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10).replace(/-/g, "");
    };
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Demo-Portal//Booking Feed//DE",
      "X-WR-CALNAME:Demo-Portal-Buchungen",
      "BEGIN:VEVENT",
      "UID:demo-001@portal.example",
      "DTSTAMP:20261109T120000Z",
      `DTSTART;VALUE=DATE:${d(40)}`,
      `DTEND;VALUE=DATE:${d(43)}`,
      "SUMMARY:Familie Sonnleitner",
      "DESCRIPTION:2 Erw.\\, 2 Kinder\\, Wohnung mit Balkon",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:demo-002@portal.example",
      "DTSTAMP:20261109T120000Z",
      `DTSTART;VALUE=DATE:${d(75)}`,
      `DTEND;VALUE=DATE:${d(78)}`,
      "SUMMARY:Reservation: Petra Winter",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    reply.header("Content-Type", "text/calendar; charset=utf-8");
    return ics;
  });
}
