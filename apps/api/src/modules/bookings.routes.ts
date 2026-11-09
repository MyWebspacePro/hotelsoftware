import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import {
  availabilityForStay,
  averageNightlyCents,
  canTransition,
  nightsBetween,
  overlaps,
  priceForStay,
  allowedTransitions,
  type BookingStatusValue,
} from "@hg/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BLOCKING: BookingStatus[] = ["OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"];

const isoToDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dateToIso = (d: Date) => d.toISOString().slice(0, 10);

const reservationInput = z.object({
  roomTypeId: z.string().min(1),
  roomId: z.string().optional(),
  dateFrom: z.string().regex(DATE_RE),
  dateTo: z.string().regex(DATE_RE),
  adults: z.number().int().min(1).max(10).default(2),
  children: z.number().int().min(0).max(10).default(0),
  ratePlanId: z.string().optional(),
  notes: z.string().optional(),
});

const createSchema = z.object({
  guestId: z.string().optional(),
  guest: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional().or(z.literal("")),
      phone: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  source: z.enum(["WEBSITE_REQUEST", "PHONE", "EMAIL", "WALK_IN", "ICAL"]).default("PHONE"),
  status: z.enum(["INQUIRY", "OFFERED", "CONFIRMED"]).optional(),
  notes: z.string().optional(),
  force: z.boolean().optional(),
  reservations: z.array(reservationInput).min(1),
});

const bookingInclude = {
  guest: true,
  reservations: {
    include: {
      roomType: { select: { id: true, name: true, color: true } },
      room: { select: { id: true, number: true } },
      ratePlan: { select: { id: true, name: true, basis: true } },
    },
  },
} as const;

/** Berechnet Preis + warns für einen Reservierungs-Entwurf anhand der DB-Preisregeln. */
async function priceReservation(hotelId: string, input: z.infer<typeof reservationInput>) {
  const roomType = await prisma.roomType.findFirst({ where: { id: input.roomTypeId, hotelId, deletedAt: null } });
  if (!roomType) return { error: "Zimmertyp existiert nicht" as const };
  const rules = await prisma.priceRule.findMany({
    where: { hotelId, roomTypeId: input.roomTypeId, deletedAt: null },
  });
  const price = priceForStay(
    input.dateFrom,
    input.dateTo,
    rules.map((r) => ({
      id: r.id,
      dateFrom: dateToIso(r.dateFrom),
      dateTo: dateToIso(r.dateTo),
      priceCents: r.priceCents,
      minStay: r.minStay,
      stopSell: r.stopSell,
    })),
    roomType.basePriceCents,
  );
  return {
    roomType,
    pricePerNightCents: averageNightlyCents(price),
    priceTotalCents: price.totalCents,
    minStayRequired: price.minStayRequired,
    stopSellNights: price.stopSellNights,
    nights: price.nights,
  };
}

async function blockingReservations(hotelId: string, from: string, to: string, excludeReservationId?: string) {
  const rows = await prisma.reservation.findMany({
    where: {
      hotelId,
      deletedAt: null,
      status: { in: BLOCKING },
      dateFrom: { lt: isoToDate(to) },
      dateTo: { gt: isoToDate(from) },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
    select: { id: true, roomTypeId: true, roomId: true, dateFrom: true, dateTo: true, status: true, bookingId: true },
  });
  return rows.map((r) => ({
    id: r.id,
    roomTypeId: r.roomTypeId,
    roomId: r.roomId,
    dateFrom: dateToIso(r.dateFrom),
    dateTo: dateToIso(r.dateTo),
    status: r.status,
    bookingId: r.bookingId,
  }));
}

/** Erstfreies Zimmer eines Typs für den Zeitraum (First-Fit). */
function findFreeRoom(
  rooms: { id: string; roomTypeId: string }[],
  roomTypeId: string,
  occupied: { roomId: string | null; dateFrom: string; dateTo: string }[],
  from: string,
  to: string,
): string | null {
  for (const room of rooms.filter((r) => r.roomTypeId === roomTypeId)) {
    const conflicts = occupied.some((o) => o.roomId === room.id && overlaps(from, to, o.dateFrom, o.dateTo));
    if (!conflicts) return room.id;
  }
  return null;
}

export async function bookingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", async (req) => {
    const { status, q, from, to, limit } = req.query as {
      status?: string;
      q?: string;
      from?: string;
      to?: string;
      limit?: string;
    };
    const statusList = status
      ? status.split(",").filter((s): s is BookingStatusValue => ["INQUIRY", "OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"].includes(s))
      : undefined;
    const bookings = await prisma.booking.findMany({
      where: {
        hotelId: req.user!.hotelId!,
        deletedAt: null,
        ...(statusList?.length ? { status: { in: statusList } } : {}),
        ...(q
          ? {
              OR: [
                { guest: { firstName: { contains: q, mode: "insensitive" } } },
                { guest: { lastName: { contains: q, mode: "insensitive" } } },
                { notes: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(from && to
          ? { reservations: { some: { dateFrom: { lt: isoToDate(to) }, dateTo: { gt: isoToDate(from) } } } }
          : {}),
      },
      include: bookingInclude,
      orderBy: { createdAt: "desc" },
      take: limit ? Number(limit) : 100,
    });
    return bookings;
  });

  app.get("/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const booking = await prisma.booking.findFirst({
      where: { id, hotelId: req.user!.hotelId!, deletedAt: null },
      include: bookingInclude,
    });
    if (!booking) return reply.code(404).send({ error: "Buchung nicht gefunden" });
    return booking;
  });

  app.post("/", async (req, reply) => {
    const hotelId = req.user!.hotelId!;
    const body = createSchema.parse(req.body);
    const force = body.force ?? false;
    const warnings: string[] = [];
    const errors: string[] = [];

    // Gast auflösen (vorhanden oder neu anlegen)
    let guestId = body.guestId;
    if (!guestId && body.guest) {
      const guest = await prisma.guest.create({
        data: { ...body.guest, email: body.guest.email || undefined, hotelId },
      });
      guestId = guest.id;
    }
    if (!guestId) {
      return reply.code(400).send({ error: "guestId oder guest erforderlich" });
    }

    // Zeitraum-Validierung
    for (const r of body.reservations) {
      if (r.dateFrom >= r.dateTo) errors.push(`Reservierung ${r.roomTypeId}: dateTo muss nach dateFrom liegen`);
    }
    if (errors.length) return reply.code(400).send({ error: errors.join("; ") });

    // Kapazität
    const roomTypes = await prisma.roomType.findMany({ where: { hotelId, deletedAt: null } });
    const rtMap = new Map(roomTypes.map((rt) => [rt.id, rt]));
    for (const r of body.reservations) {
      const rt = rtMap.get(r.roomTypeId);
      if (!rt) errors.push("Zimmertyp existiert nicht");
      else if (r.adults + r.children > rt.capacity + rt.maxExtraBeds) {
        errors.push(`${rt.name}: ${r.adults} Erw. + ${r.children} Kinder über Kapazität (${rt.capacity} + ${rt.maxExtraBeds} Extrabetten)`);
      }
    }
    if (errors.length) return reply.code(400).send({ error: errors.join("; ") });

    // Verfügbarkeit + Preise
    const minFrom = body.reservations.map((r) => r.dateFrom).sort()[0];
    const maxTo = body.reservations.map((r) => r.dateTo).sort().slice(-1)[0];
    const allRooms = await prisma.room.findMany({ where: { hotelId, deletedAt: null }, select: { id: true, roomTypeId: true } });
    const roomCounts = new Map<string, number>();
    for (const room of allRooms) roomCounts.set(room.roomTypeId, (roomCounts.get(room.roomTypeId) ?? 0) + 1);
    const existing = await blockingReservations(hotelId, minFrom, maxTo);

    const priced: Array<{ input: z.infer<typeof reservationInput>; pricePerNightCents: number; priceTotalCents: number; roomId: string | null }> = [];
    for (const r of body.reservations) {
      const p = await priceReservation(hotelId, r);
      if ("error" in p) return reply.code(400).send({ error: p.error });
      const avail = availabilityForStay(existing, r.roomTypeId, roomCounts.get(r.roomTypeId) ?? 0, r.dateFrom, r.dateTo);
      if (avail.availableForStay < 1 && !force) {
        errors.push(`${p.roomType.name} ${r.dateFrom}–${r.dateTo}: ausgebucht (${avail.availableForStay} frei) — force erzwingt Überbuchung`);
        continue;
      }
      if (p.stopSellNights > 0 && !force) {
        errors.push(`${p.roomType.name}: Stop-Sell an ${p.stopSellNights} Nacht(en)`);
        continue;
      }
      if (r.adults + r.children < 1) errors.push("Personen fehlen");
      if (p.minStayRequired > nightsBetween(r.dateFrom, r.dateTo)) {
        warnings.push(`Mindestaufenthalt ${p.minStayRequired} Nächte empfohlen (Saisonregel)`);
      }
      const roomId =
        r.roomId ??
        findFreeRoom(
          allRooms,
          r.roomTypeId,
          existing.map((e) => ({ roomId: e.roomId, dateFrom: e.dateFrom, dateTo: e.dateTo })),
          r.dateFrom,
          r.dateTo,
        );
      if (r.roomId) {
        const roomConflict = existing.some((e) => e.roomId === r.roomId && overlaps(r.dateFrom, r.dateTo, e.dateFrom, e.dateTo));
        if (roomConflict && !force) {
          errors.push(`Zimmer bereits belegt im Zeitraum ${r.dateFrom}–${r.dateTo}`);
          continue;
        }
      }
      priced.push({ input: r, pricePerNightCents: p.pricePerNightCents, priceTotalCents: p.priceTotalCents, roomId });
    }
    if (errors.length) return reply.code(409).send({ error: errors.join("; ") });

    const status: BookingStatusValue = body.status ?? "INQUIRY";
    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          hotelId,
          status,
          source: body.source,
          guestId: guestId!,
          notes: body.notes,
          reservations: {
            create: priced.map((p) => ({
              hotelId,
              status,
              roomTypeId: p.input.roomTypeId,
              roomId: p.roomId,
              ratePlanId: p.input.ratePlanId,
              dateFrom: isoToDate(p.input.dateFrom),
              dateTo: isoToDate(p.input.dateTo),
              adults: p.input.adults,
              children: p.input.children,
              notes: p.input.notes,
              pricePerNightCents: p.pricePerNightCents,
              priceTotalCents: p.priceTotalCents,
            })),
          },
        },
        include: bookingInclude,
      });
      return created;
    });

    await writeAudit({
      hotelId,
      userId: req.user!.id,
      entity: "Booking",
      entityId: booking.id,
      action: "CREATE",
      after: { status, source: body.source, reservations: priced.length, totalCents: priced.reduce((s, p) => s + p.priceTotalCents, 0) },
    });
    return reply.code(201).send({ booking, warnings });
  });

  app.patch("/:id/status", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z.object({ status: z.enum(["INQUIRY", "OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"]) }).parse(req.body);
    const booking = await prisma.booking.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null }, include: { reservations: true } });
    if (!booking) return reply.code(404).send({ error: "Buchung nicht gefunden" });
    if (!canTransition(booking.status, body.status)) {
      return reply.code(400).send({
        error: `Statuswechsel ${booking.status} → ${body.status} nicht erlaubt`,
        allowed: allowedTransitions(booking.status),
      });
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { status: body.status } });
      // Reservierungen spiegeln den Booking-Status
      await tx.reservation.updateMany({ where: { bookingId: id, deletedAt: null }, data: { status: body.status } });
      return tx.booking.findFirstOrThrow({ where: { id }, include: bookingInclude });
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Booking", entityId: id, action: `STATUS_${body.status}`, before: { status: booking.status }, after: { status: body.status } });
    return reply.send(updated);
  });

  app.patch("/:id/reservations/:resId", async (req, reply) => {
    const { id, resId } = req.params as { id: string; resId: string };
    const hotelId = req.user!.hotelId!;
    const body = reservationInput.partial().parse(req.body);
    const force = (req.query as { force?: string }).force === "true";

    const booking = await prisma.booking.findFirst({ where: { id, hotelId, deletedAt: null } });
    if (!booking) return reply.code(404).send({ error: "Buchung nicht gefunden" });
    const res = await prisma.reservation.findFirst({ where: { id: resId, bookingId: id, deletedAt: null } });
    if (!res) return reply.code(404).send({ error: "Reservierung nicht gefunden" });

    const merged = {
      roomTypeId: body.roomTypeId ?? res.roomTypeId,
      roomId: body.roomId ?? res.roomId ?? undefined,
      dateFrom: dateToIso(res.dateFrom),
      dateTo: dateToIso(res.dateTo),
      adults: res.adults,
      children: res.children,
      ratePlanId: res.ratePlanId ?? undefined,
      notes: res.notes ?? undefined,
      ...body,
    };
    if (merged.dateFrom >= merged.dateTo) {
      return reply.code(400).send({ error: "dateTo muss nach dateFrom liegen" });
    }

    const p = await priceReservation(hotelId, merged as z.infer<typeof reservationInput>);
    if ("error" in p) return reply.code(400).send({ error: p.error });

    const existing = await blockingReservations(hotelId, merged.dateFrom, merged.dateTo, resId);
    if (merged.roomId) {
      const roomConflict = existing.some((e) => e.roomId === merged.roomId && overlaps(merged.dateFrom, merged.dateTo, e.dateFrom, e.dateTo));
      if (roomConflict && !force) {
        return reply.code(409).send({ error: "Zimmer ist im Zielzeitraum bereits belegt" });
      }
    }
    const roomCounts = await prisma.room.groupBy({ by: ["roomTypeId"], where: { hotelId, deletedAt: null }, _count: true });
    const count = roomCounts.find((c) => c.roomTypeId === merged.roomTypeId)?._count ?? 0;
    const avail = availabilityForStay(existing, merged.roomTypeId, count, merged.dateFrom, merged.dateTo);
    if (avail.availableForStay < 1 && !force) {
      return reply.code(409).send({ error: "Zielzeitraum ausgebucht — force erzwingt Überbuchung" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: resId },
        data: {
          roomTypeId: merged.roomTypeId,
          roomId: merged.roomId ?? null,
          ratePlanId: merged.ratePlanId ?? null,
          dateFrom: isoToDate(merged.dateFrom),
          dateTo: isoToDate(merged.dateTo),
          adults: merged.adults,
          children: merged.children,
          notes: merged.notes,
          pricePerNightCents: p.pricePerNightCents,
          priceTotalCents: p.priceTotalCents,
        },
      });
      return tx.booking.findFirstOrThrow({ where: { id }, include: bookingInclude });
    });
    await writeAudit({ hotelId, userId: req.user!.id, entity: "Reservation", entityId: resId, action: "UPDATE", after: { dateFrom: merged.dateFrom, dateTo: merged.dateTo, roomId: merged.roomId } });
    return reply.send(updated);
  });

  app.delete("/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const booking = await prisma.booking.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!booking) return reply.code(404).send({ error: "Buchung nicht gefunden" });
    const now = new Date();
    await prisma.$transaction([
      prisma.reservation.updateMany({ where: { bookingId: id, deletedAt: null }, data: { deletedAt: now } }),
      prisma.booking.update({ where: { id }, data: { deletedAt: now } }),
    ]);
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Booking", entityId: id, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });
}
