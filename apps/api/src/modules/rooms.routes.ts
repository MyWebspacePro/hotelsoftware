import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";

const MANAGE = { preHandler: requireRole("ADMIN", "MANAGER") } as const;

const roomTypeSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1).max(20),
  maxExtraBeds: z.number().int().min(0).max(6).optional(),
  description: z.string().optional(),
  basePriceCents: z.number().int().min(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const roomSchema = z.object({
  roomTypeId: z.string().min(1),
  number: z.string().min(1),
  floor: z.number().int().optional(),
  notes: z.string().optional(),
});

const roomTypeSelect = {
  id: true,
  name: true,
  capacity: true,
  maxExtraBeds: true,
  description: true,
  basePriceCents: true,
  color: true,
  _count: { select: { rooms: true } },
} as const;

export async function roomsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // ── Zimmertypen ────────────────────────────────────────────
  app.get("/types", async (req) => {
    return prisma.roomType.findMany({
      where: { hotelId: req.user!.hotelId!, deletedAt: null },
      select: roomTypeSelect,
      orderBy: { name: "asc" },
    });
  });

  app.post("/types", MANAGE, async (req, reply) => {
    const body = roomTypeSchema.parse(req.body);
    const rt = await prisma.roomType.create({
      data: { ...body, hotelId: req.user!.hotelId! },
      select: roomTypeSelect,
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "RoomType", entityId: rt.id, action: "CREATE", after: body });
    return reply.code(201).send(rt);
  });

  app.patch("/types/:id", MANAGE, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = roomTypeSchema.partial().parse(req.body);
    const before = await prisma.roomType.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!before) return reply.code(404).send({ error: "Zimmertyp nicht gefunden" });
    const rt = await prisma.roomType.update({ where: { id }, data: body, select: roomTypeSelect });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "RoomType", entityId: id, action: "UPDATE", before: { name: before.name, basePriceCents: before.basePriceCents }, after: body });
    return reply.send(rt);
  });

  app.delete("/types/:id", MANAGE, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const rt = await prisma.roomType.findFirst({
      where: { id, hotelId: req.user!.hotelId!, deletedAt: null },
      include: { _count: { select: { rooms: true, reservations: true } } },
    });
    if (!rt) return reply.code(404).send({ error: "Zimmertyp nicht gefunden" });
    if (rt._count.rooms > 0) {
      return reply.code(409).send({ error: `Zimmertyp hat noch ${rt._count.rooms} Zimmer — erst Zimmer entfernen` });
    }
    await prisma.roomType.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "RoomType", entityId: id, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });

  // ── Zimmer ─────────────────────────────────────────────────
  app.get("/", async (req) => {
    return prisma.room.findMany({
      where: { hotelId: req.user!.hotelId!, deletedAt: null },
      include: { roomType: { select: { id: true, name: true, color: true, capacity: true } } },
      orderBy: [{ roomTypeId: "asc" }, { number: "asc" }],
    });
  });

  app.post("/", MANAGE, async (req, reply) => {
    const body = roomSchema.parse(req.body);
    const rt = await prisma.roomType.findFirst({ where: { id: body.roomTypeId, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!rt) return reply.code(400).send({ error: "Zimmertyp existiert nicht" });
    const duplicate = await prisma.room.findFirst({ where: { hotelId: req.user!.hotelId!, number: body.number, deletedAt: null } });
    if (duplicate) return reply.code(409).send({ error: `Zimmernummer ${body.number} existiert bereits` });
    const room = await prisma.room.create({ data: { ...body, hotelId: req.user!.hotelId! } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Room", entityId: room.id, action: "CREATE", after: body });
    return reply.code(201).send(room);
  });

  app.patch("/:id", MANAGE, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = roomSchema.partial().parse(req.body);
    const room = await prisma.room.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!room) return reply.code(404).send({ error: "Zimmer nicht gefunden" });
    const updated = await prisma.room.update({ where: { id }, data: body });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Room", entityId: id, action: "UPDATE", before: { number: room.number }, after: body });
    return reply.send(updated);
  });

  app.delete("/:id", MANAGE, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const room = await prisma.room.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!room) return reply.code(404).send({ error: "Zimmer nicht gefunden" });
    await prisma.room.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Room", entityId: id, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });
}
