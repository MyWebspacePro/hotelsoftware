import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { assertPublicHttpUrl } from "../lib/net.js";
import {
  addDays,
  buildIcalCalendar,
  nightsBetween,
  overlaps,
  parseIcalCalendar,
  todayIso,
  type IcalExternalEvent,
} from "@hg/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dateToIso = (d: Date) => d.toISOString().slice(0, 10);

const BLOCKING = ["OFFERED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] as const;

/** Kryptografisch sicherer Export-Token (32 Hex-Zeichen). */
function newExportToken(): string {
  return randomBytes(16).toString("hex");
}

const connectionSchema = z.object({
  name: z.string().min(1),
  platform: z.enum(["AIRBNB", "BOOKING", "OTHER"]).default("AIRBNB"),
  direction: z.enum(["IMPORT", "EXPORT", "BOTH"]).default("IMPORT"),
  roomTypeId: z.string().nullable().optional(),
  importUrl: z.string().url().nullable().optional(),
});

interface OccupiedRow {
  bookingId: string | null;
  roomId: string | null;
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
}

/** Gastname aus Feed-Summary ("Reservation: Max Muster") ableiten. */
function guestNameFromSummary(summary: string | null, platform: string): { firstName: string; lastName: string } {
  const cleaned = (summary ?? "").replace(/^(Reservation|Buchung|Booking)\s*[:\-]\s*/i, "").trim();
  if (!cleaned) {
    return { firstName: `${platform}-Gast`, lastName: "(Portal-Import)" };
  }
  const parts = cleaned.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || `(${platform}-Import)` };
}

/** Erstfreies Zimmer eines Typs für den Zeitraum (First-Fit). */
function findFreeRoom(
  rooms: { id: string; roomTypeId: string }[],
  roomTypeId: string,
  occupied: OccupiedRow[],
  from: string,
  to: string,
): string | null {
  for (const room of rooms.filter((r) => r.roomTypeId === roomTypeId)) {
    if (!occupied.some((o) => o.roomId === room.id && overlaps(from, to, o.dateFrom, o.dateTo))) {
      return room.id;
    }
  }
  return null;
}

/** Projektion löschen: nur wenn der Portal-Buchung unangetastet ist (kein Folio, CONFIRMED). */
async function deleteExternalBookingIfClean(bookingId: string | null): Promise<number> {
  if (!bookingId) return 0;
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null, source: "ICAL", status: "CONFIRMED" },
    include: { _count: { select: { folios: true } } },
  });
  if (!booking || booking._count.folios > 0) return 0;
  // Reihenfolge wegen FKs: Melde-Records → Reservierungen → Buchung (IcalEvents per SetNull)
  const reservationIds = (
    await prisma.reservation.findMany({ where: { bookingId: booking.id }, select: { id: true } })
  ).map((r) => r.id);
  if (reservationIds.length) {
    await prisma.registrationRecord.deleteMany({ where: { reservationId: { in: reservationIds } } });
  }
  await prisma.reservation.deleteMany({ where: { bookingId: booking.id } });
  await prisma.booking.delete({ where: { id: booking.id } });
  return 1;
}

export async function channelsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // ── Verbindungsverwaltung ──────────────────────────────────

  app.get("/connections", async (req) => {
    const hotelId = req.user!.hotelId!;
    const connections = await prisma.channelConnection.findMany({
      where: { hotelId },
      include: {
        roomType: { select: { name: true } },
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return connections.map((c) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      direction: c.direction,
      roomTypeId: c.roomTypeId,
      roomTypeName: c.roomType?.name ?? null,
      importUrl: c.importUrl,
      exportToken: c.exportToken,
      active: c.active,
      lastSyncAt: c.lastSyncAt,
      lastSyncStatus: c.lastSyncStatus,
      eventCount: c._count.events,
    }));
  });

  app.post("/connections", async (req, reply) => {
    const body = connectionSchema.parse(req.body);
    if (body.direction !== "EXPORT" && !body.importUrl) {
      return reply.code(400).send({ error: "Import-Verbindungen brauchen eine iCal-Import-URL" });
    }
    if (body.importUrl) {
      try {
        await assertPublicHttpUrl(body.importUrl);
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Ungültige Import-URL" });
      }
    }
    if (body.roomTypeId) {
      const rt = await prisma.roomType.findFirst({
        where: { id: body.roomTypeId, hotelId: req.user!.hotelId!, deletedAt: null },
      });
      if (!rt) return reply.code(400).send({ error: "Zimmertyp existiert nicht" });
    }
    const created = await prisma.channelConnection.create({
      data: {
        hotelId: req.user!.hotelId!,
        name: body.name,
        platform: body.platform,
        direction: body.direction,
        roomTypeId: body.roomTypeId ?? null,
        importUrl: body.importUrl ?? null,
        exportToken: newExportToken(),
      },
    });
    await writeAudit({
      hotelId: req.user!.hotelId,
      userId: req.user!.id,
      entity: "ChannelConnection",
      entityId: created.id,
      action: "CREATE",
      after: { name: created.name, platform: created.platform },
    });
    return reply.code(201).send({ id: created.id, exportToken: created.exportToken });
  });

  app.patch("/connections/:id", async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        platform: z.enum(["AIRBNB", "BOOKING", "OTHER"]).optional(),
        direction: z.enum(["IMPORT", "EXPORT", "BOTH"]).optional(),
        roomTypeId: z.string().nullable().optional(),
        importUrl: z.string().url().nullable().optional(),
        active: z.boolean().optional(),
        regenerateToken: z.boolean().optional(),
      })
      .parse(req.body);

    const existing = await prisma.channelConnection.findFirst({
      where: { id: ((req.params as Record<string, string>).id), hotelId: req.user!.hotelId! },
    });
    if (!existing) return reply.code(404).send({ error: "Verbindung nicht gefunden" });
    if ((body.direction ?? existing.direction) !== "EXPORT" && (body.importUrl ?? existing.importUrl) == null) {
      return reply.code(400).send({ error: "Import-Verbindungen brauchen eine iCal-Import-URL" });
    }
    if (body.importUrl) {
      try {
        await assertPublicHttpUrl(body.importUrl);
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : "Ungültige Import-URL" });
      }
    }
    if (body.roomTypeId) {
      const rt = await prisma.roomType.findFirst({
        where: { id: body.roomTypeId, hotelId: req.user!.hotelId!, deletedAt: null },
      });
      if (!rt) return reply.code(400).send({ error: "Zimmertyp existiert nicht" });
    }

    const updated = await prisma.channelConnection.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.platform !== undefined ? { platform: body.platform } : {}),
        ...(body.direction !== undefined ? { direction: body.direction } : {}),
        ...(body.roomTypeId !== undefined ? { roomTypeId: body.roomTypeId } : {}),
        ...(body.importUrl !== undefined ? { importUrl: body.importUrl } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.regenerateToken
          ? { exportToken: newExportToken() }
          : {}),
      },
    });
    await writeAudit({
      hotelId: req.user!.hotelId,
      userId: req.user!.id,
      entity: "ChannelConnection",
      entityId: existing.id,
      action: "UPDATE",
    });
    return { id: updated.id, exportToken: updated.exportToken };
  });

  app.delete("/connections/:id", async (req, reply) => {
    const existing = await prisma.channelConnection.findFirst({
      where: { id: ((req.params as Record<string, string>).id), hotelId: req.user!.hotelId! },
    });
    if (!existing) return reply.code(404).send({ error: "Verbindung nicht gefunden" });
    await prisma.channelConnection.delete({ where: { id: existing.id } }); // Events/Logs kaskadieren
    await writeAudit({
      hotelId: req.user!.hotelId,
      userId: req.user!.id,
      entity: "ChannelConnection",
      entityId: existing.id,
      action: "DELETE",
    });
    return { ok: true };
  });

  // ── Importierte Events & Konflikte ─────────────────────────

  app.get("/events", async (req) => {
    const hotelId = req.user!.hotelId!;
    const { connectionId, onlyConflicts } = req.query as { connectionId?: string; onlyConflicts?: string };
    const events = await prisma.icalEvent.findMany({
      where: {
        connection: { hotelId },
        ...(connectionId ? { connectionId } : {}),
        ...(onlyConflicts === "1" ? { conflict: true } : {}),
      },
      include: {
        connection: { select: { name: true, platform: true, roomTypeId: true, roomType: { select: { name: true } } } },
        booking: { select: { id: true, status: true } },
      },
      orderBy: { dateFrom: "asc" },
      take: 500,
    });
    return events.map((e) => ({
      id: e.id,
      connectionId: e.connectionId,
      connectionName: e.connection.name,
      platform: e.connection.platform,
      roomTypeName: e.connection.roomType?.name ?? null,
      externalUid: e.externalUid,
      summary: e.summary,
      dateFrom: dateToIso(e.dateFrom),
      dateTo: dateToIso(e.dateTo),
      nights: nightsBetween(dateToIso(e.dateFrom), dateToIso(e.dateTo)),
      conflict: e.conflict,
      conflictNote: e.conflictNote,
      bookingId: e.bookingId,
      bookingStatus: e.booking?.status ?? null,
      lastSeenAt: e.lastSeenAt,
    }));
  });

  app.get("/logs", async (req) => {
    const logs = await prisma.channelSyncLog.findMany({
      where: { connection: { hotelId: req.user!.hotelId! } },
      include: { connection: { select: { name: true } } },
      orderBy: { ranAt: "desc" },
      take: 50,
    });
    return logs.map((l) => ({
      id: l.id,
      connectionId: l.connectionId,
      connectionName: l.connection.name,
      direction: l.direction,
      status: l.status,
      imported: l.imported,
      updated: l.updated,
      removed: l.removed,
      conflicts: l.conflicts,
      message: l.message,
      ranAt: l.ranAt,
    }));
  });

  // ── Synchronisation ────────────────────────────────────────

  app.post("/connections/:id/sync", async (req, reply) => {
    const connection = await prisma.channelConnection.findFirst({
      where: { id: ((req.params as Record<string, string>).id), hotelId: req.user!.hotelId! },
    });
    if (!connection) return reply.code(404).send({ error: "Verbindung nicht gefunden" });
    if (!connection.active) return reply.code(400).send({ error: "Verbindung ist inaktiv" });
    if (connection.direction === "EXPORT") {
      return reply.code(400).send({ error: "Export-Verbindung hat keinen Import" });
    }
    if (!connection.importUrl) {
      return reply.code(400).send({ error: "Keine Import-URL konfiguriert" });
    }

    // Feed holen
    try {
      await assertPublicHttpUrl(connection.importUrl);
    } catch (err) {
      return await finishSync(req.user!.id, req.user!.hotelId!, connection.id, {
        status: "ERROR",
        imported: 0, updated: 0, removed: 0, conflicts: 0,
        message: err instanceof Error ? err.message : "Ungültige Import-URL",
      });
    }

    let text: string;
    try {
      const res = await fetch(connection.importUrl, { signal: AbortSignal.timeout(15000), redirect: "error" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (err) {
      return await finishSync(req.user!.id, req.user!.hotelId!, connection.id, {
        status: "ERROR",
        imported: 0, updated: 0, removed: 0, conflicts: 0,
        message: `Feed nicht erreichbar: ${err instanceof Error ? err.message : "unbekannter Fehler"}`,
      });
    }

    const parsed = parseIcalCalendar(text);
    const result = await projectEvents(connection, parsed);
    return await finishSync(req.user!.id, req.user!.hotelId!, connection.id, result);
  });

  /** Feed-Events in Kalender/Reservierungen projizieren (Upsert, Konflikte, Entferntes). */
  async function projectEvents(
    connection: { id: string; hotelId: string; name: string; platform: string; roomTypeId: string | null },
    parsed: IcalExternalEvent[],
  ): Promise<{ status: string; imported: number; updated: number; removed: number; conflicts: number; message: string }> {
    const existingEvents = await prisma.icalEvent.findMany({ where: { connectionId: connection.id } });
    const byUid = new Map(existingEvents.map((e) => [e.externalUid, e]));
    const seenUids = new Set<string>();
    const removedUids = new Set<string>();

    let imported = 0;
    let updated = 0;
    let conflicts = 0;
    let removed = 0;

    const roomTypeId = connection.roomTypeId;

    // In-Memory-Belegung für Konflikt-/Zimmerberechnung (wächst mit neuen Importen)
    const minFrom = parsed.length ? parsed.map((p) => p.dateFrom).reduce((a, b) => (a < b ? a : b)) : todayIso();
    const maxTo = parsed.length ? parsed.map((p) => p.dateTo).reduce((a, b) => (a > b ? a : b)) : todayIso();
    const occupied: OccupiedRow[] = (
      await prisma.reservation.findMany({
        where: {
          hotelId: connection.hotelId,
          deletedAt: null,
          status: { in: [...BLOCKING] },
          dateFrom: { lt: isoToDate(maxTo) },
          dateTo: { gt: isoToDate(minFrom) },
        },
        select: { bookingId: true, roomId: true, roomTypeId: true, dateFrom: true, dateTo: true },
      })
    ).map((r) => ({
      bookingId: r.bookingId,
      roomId: r.roomId,
      roomTypeId: r.roomTypeId,
      dateFrom: dateToIso(r.dateFrom),
      dateTo: dateToIso(r.dateTo),
    }));
    const rooms = await prisma.room.findMany({
      where: { hotelId: connection.hotelId, deletedAt: null },
      select: { id: true, roomTypeId: true },
    });
    const roomCounts: Record<string, number> = {};
    for (const r of rooms) roomCounts[r.roomTypeId] = (roomCounts[r.roomTypeId] ?? 0) + 1;

    for (const ev of parsed) {
      seenUids.add(ev.uid);
      const existing = byUid.get(ev.uid);

      // Storniertes Portal-Event: Projektion entfernen, nicht als Buchung anlegen.
      if (ev.status === "CANCELLED") {
        if (existing?.bookingId) {
          removed += await deleteExternalBookingIfClean(existing.bookingId);
        }
        await prisma.icalEvent.deleteMany({ where: { connectionId: connection.id, externalUid: ev.uid } });
        byUid.delete(ev.uid);
        removedUids.add(ev.uid);
        removed += 1;
        continue;
      }

      if (!roomTypeId) {
        // Ohne Zimmertyp: nur listen, nicht kalenderwirksam
        await prisma.icalEvent.upsert({
          where: { connectionId_externalUid: { connectionId: connection.id, externalUid: ev.uid } },
          create: {
            connectionId: connection.id,
            externalUid: ev.uid,
            summary: ev.summary,
            description: ev.description,
            dateFrom: isoToDate(ev.dateFrom),
            dateTo: isoToDate(ev.dateTo),
            conflict: false,
            conflictNote: null,
            lastSeenAt: new Date(),
          },
          update: {
            summary: ev.summary,
            description: ev.description,
            dateFrom: isoToDate(ev.dateFrom),
            dateTo: isoToDate(ev.dateTo),
            conflict: false,
            conflictNote: null,
            lastSeenAt: new Date(),
          },
        });
        if (!existing) imported += 1;
        else updated += 1;
        continue;
      }

      // Konflikt: sind alle Zimmer des Typs durch ANDERE Buchungen belegt?
      const others = occupied.filter(
        (o) => o.roomTypeId === roomTypeId && o.bookingId !== existing?.bookingId && overlaps(ev.dateFrom, ev.dateTo, o.dateFrom, o.dateTo),
      );
      const total = roomCounts[roomTypeId] ?? 0;
      const isConflict = total > 0 && others.length >= total;

      if (isConflict) {
        const note = `Alle Zimmer (${total}) sind an diesen Nächten belegt — Portal-Buchung NICHT übernommen`;
        if (existing?.bookingId) {
          // Früher übernommen, jetzt kollidiert (z. B. Datum im Feed geändert): Projektion zurückziehen
          removed += await deleteExternalBookingIfClean(existing.bookingId);
        }
        await prisma.icalEvent.upsert({
          where: { connectionId_externalUid: { connectionId: connection.id, externalUid: ev.uid } },
          create: {
            connectionId: connection.id,
            externalUid: ev.uid,
            summary: ev.summary,
            description: ev.description,
            dateFrom: isoToDate(ev.dateFrom),
            dateTo: isoToDate(ev.dateTo),
            conflict: true,
            conflictNote: note,
            lastSeenAt: new Date(),
          },
          update: {
            summary: ev.summary,
            description: ev.description,
            dateFrom: isoToDate(ev.dateFrom),
            dateTo: isoToDate(ev.dateTo),
            conflict: true,
            conflictNote: note,
            bookingId: null,
            lastSeenAt: new Date(),
          },
        });
        conflicts += 1;
        continue;
      }

      const guest = guestNameFromSummary(ev.summary, connection.platform);
      let bookingId = existing?.bookingId ?? null;

      if (bookingId) {
        // Bestehende Projektion: Daten/Zimmer nachziehen
        const reservation = await prisma.reservation.findFirst({
          where: { bookingId, deletedAt: null },
        });
        const booking = await prisma.booking.findFirst({ where: { id: bookingId, deletedAt: null } });
        if (booking && reservation) {
          const newRoomId = reservation.roomId ?? findFreeRoom(rooms, roomTypeId, others, ev.dateFrom, ev.dateTo);
          await prisma.reservation.update({
            where: { id: reservation.id },
            data: {
              dateFrom: isoToDate(ev.dateFrom),
              dateTo: isoToDate(ev.dateTo),
              ...(newRoomId ? { roomId: newRoomId } : {}),
            },
          });
          occupied.push({
            bookingId,
            roomId: newRoomId,
            roomTypeId,
            dateFrom: ev.dateFrom,
            dateTo: ev.dateTo,
          });
          await prisma.icalEvent.update({
            where: { connectionId_externalUid: { connectionId: connection.id, externalUid: ev.uid } },
            data: {
              summary: ev.summary,
              description: ev.description,
              dateFrom: isoToDate(ev.dateFrom),
              dateTo: isoToDate(ev.dateTo),
              conflict: false,
              conflictNote: null,
              lastSeenAt: new Date(),
            },
          });
          updated += 1;
          continue;
        }
        bookingId = null; // Buchung weg → neu anlegen
      }

      // Neu übernehmen: Gast + Buchung (CONFIRMED, Quelle ICAL, kein Preis) + Reservierung
      const guestRec = await prisma.guest.create({ data: { hotelId: connection.hotelId, ...guest } });
      const newRoomId = findFreeRoom(rooms, roomTypeId, occupied, ev.dateFrom, ev.dateTo);
      const booking = await prisma.booking.create({
        data: {
          hotelId: connection.hotelId,
          status: "CONFIRMED",
          source: "ICAL",
          channelRef: ev.uid,
          notes: `iCal-Import via ${connection.name}${ev.description ? ` — ${ev.description}` : ""}`,
          guestId: guestRec.id,
        },
      });
      const newRes = await prisma.reservation.create({
        data: {
          hotelId: connection.hotelId,
          bookingId: booking.id,
          status: "CONFIRMED",
          roomTypeId,
          roomId: newRoomId,
          dateFrom: isoToDate(ev.dateFrom),
          dateTo: isoToDate(ev.dateTo),
          adults: 2,
          children: 0,
          pricePerNightCents: 0,
          priceTotalCents: 0,
          notes: "Portal-Import (Preis im Portal abgerechnet)",
        },
      });
      bookingId = booking.id;
      occupied.push({ bookingId, roomId: newRes.roomId, roomTypeId, dateFrom: ev.dateFrom, dateTo: ev.dateTo });

      await prisma.icalEvent.upsert({
        where: { connectionId_externalUid: { connectionId: connection.id, externalUid: ev.uid } },
        create: {
          connectionId: connection.id,
          externalUid: ev.uid,
          summary: ev.summary,
          description: ev.description,
          dateFrom: isoToDate(ev.dateFrom),
          dateTo: isoToDate(ev.dateTo),
          conflict: false,
          conflictNote: null,
          bookingId,
          lastSeenAt: new Date(),
        },
        update: {
          summary: ev.summary,
          description: ev.description,
          dateFrom: isoToDate(ev.dateFrom),
          dateTo: isoToDate(ev.dateTo),
          conflict: false,
          conflictNote: null,
          bookingId,
          lastSeenAt: new Date(),
        },
      });
      imported += 1;
    }

    // Verschollene Feed-Events löschen (+ saubere Projektionen)
    for (const existing of byUid.values()) {
      if (!seenUids.has(existing.externalUid) && !removedUids.has(existing.externalUid)) {
        removed += await deleteExternalBookingIfClean(existing.bookingId);
        await prisma.icalEvent.delete({ where: { id: existing.id } });
        removed += 1;
      }
    }

    return {
      status: "OK",
      imported,
      updated,
      removed,
      conflicts,
      message: `${parsed.length} Feed-Events verarbeitet`,
    };
  }

  async function finishSync(
    userId: string,
    hotelId: string,
    connectionId: string,
    result: { status: string; imported: number; updated: number; removed: number; conflicts: number; message: string },
  ) {
    await prisma.channelSyncLog.create({
      data: { connectionId, direction: "IMPORT", ...result },
    });
    await prisma.channelConnection.update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date(), lastSyncStatus: result.status },
    });
    await writeAudit({
      hotelId,
      userId,
      entity: "ChannelConnection",
      entityId: connectionId,
      action: "SYNC",
      after: { ...result },
    });
    return result;
  }
}
