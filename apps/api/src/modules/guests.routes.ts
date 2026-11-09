import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";

const guestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  nationality: z.string().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  marketingConsent: z.boolean().optional(),
  notes: z.string().optional(),
});

const guestSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  address: true,
  zip: true,
  city: true,
  country: true,
  nationality: true,
  birthDate: true,
  idType: true,
  idNumber: true,
  marketingConsent: true,
  notes: true,
  createdAt: true,
} as const;

export async function guestsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", async (req) => {
    const q = (req.query as { q?: string }).q?.trim();
    return prisma.guest.findMany({
      where: {
        hotelId: req.user!.hotelId!,
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: guestSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 200,
    });
  });

  app.post("/", async (req, reply) => {
    const body = guestSchema.parse(req.body);
    const { birthDate, ...rest } = body;
    const guest = await prisma.guest.create({
      data: {
        ...rest,
        email: rest.email || undefined,
        birthDate: birthDate ? new Date(`${birthDate}T00:00:00.000Z`) : undefined,
        hotelId: req.user!.hotelId!,
      },
      select: guestSelect,
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Guest", entityId: guest.id, action: "CREATE", after: { firstName: guest.firstName, lastName: guest.lastName } });
    return reply.code(201).send(guest);
  });

  app.patch("/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = guestSchema.partial().parse(req.body);
    const guest = await prisma.guest.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!guest) return reply.code(404).send({ error: "Gast nicht gefunden" });
    const { birthDate, ...rest } = body;
    const updated = await prisma.guest.update({
      where: { id },
      data: {
        ...rest,
        email: rest.email || undefined,
        ...(birthDate !== undefined ? { birthDate: birthDate ? new Date(`${birthDate}T00:00:00.000Z`) : null } : {}),
      },
      select: guestSelect,
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Guest", entityId: id, action: "UPDATE", after: { firstName: updated.firstName, lastName: updated.lastName } });
    return reply.send(updated);
  });

  app.delete("/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const guest = await prisma.guest.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!guest) return reply.code(404).send({ error: "Gast nicht gefunden" });
    await prisma.guest.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Guest", entityId: id, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });
}
