import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { safeSnapshot, writeAudit } from "../lib/audit.js";

const ROLES = ["ADMIN", "MANAGER", "RECEPTION", "HOUSEKEEPING", "SERVICE"] as const;

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(ROLES),
  active: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
});

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  active: true,
  hotelId: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req) => {
    return prisma.user.findMany({
      where: { hotelId: req.user!.hotelId, deletedAt: null },
      select: userSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  });

  app.post("/", { preHandler: requireRole("ADMIN") }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const existing = await prisma.user.findFirst({ where: { email: body.email, deletedAt: null } });
    if (existing) {
      return reply.code(409).send({ error: "E-Mail ist bereits vergeben" });
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { ...body, passwordHash, hotelId: req.user!.hotelId },
      select: userSelect,
    });
    await writeAudit({
      hotelId: req.user!.hotelId,
      userId: req.user!.id,
      entity: "User",
      entityId: user.id,
      action: "CREATE",
      after: safeSnapshot(user as unknown as Record<string, unknown>),
    });
    return reply.code(201).send(user);
  });

  app.patch("/:id", { preHandler: requireRole("ADMIN") }, async (req, reply) => {
    const body = updateSchema.parse(req.body);
    const id = (req.params as { id: string }).id;
    const hotelId = req.user!.hotelId;
    const before = await prisma.user.findFirst({ where: { id, hotelId, deletedAt: null } });
    if (!before) {
      return reply.code(404).send({ error: "Benutzer nicht gefunden" });
    }
    const user = await prisma.user.update({
      where: { id },
      data: body,
      select: userSelect,
    });
    await writeAudit({
      hotelId: req.user!.hotelId,
      userId: req.user!.id,
      entity: "User",
      entityId: id,
      action: "UPDATE",
      before: safeSnapshot(before as unknown as Record<string, unknown>),
      after: safeSnapshot(user as unknown as Record<string, unknown>),
    });
    return reply.send(user);
  });

  app.delete("/:id", { preHandler: requireRole("ADMIN") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (id === req.user!.id) {
      return reply.code(400).send({ error: "Man kann sich nicht selbst löschen" });
    }
    const before = await prisma.user.findFirst({ where: { id, hotelId: req.user!.hotelId, deletedAt: null } });
    if (!before) {
      return reply.code(404).send({ error: "Benutzer nicht gefunden" });
    }
    // Soft-Delete: Datensatz bleibt als Archiv erhalten
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await writeAudit({
      hotelId: req.user!.hotelId,
      userId: req.user!.id,
      entity: "User",
      entityId: id,
      action: "SOFT_DELETE",
      before: safeSnapshot(before as unknown as Record<string, unknown>),
    });
    return reply.send({ ok: true });
  });
}
