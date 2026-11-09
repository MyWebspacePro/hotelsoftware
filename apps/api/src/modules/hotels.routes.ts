import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  country: z.enum(["DE", "AT", "CH"]).optional(),
  currency: z.enum(["EUR", "CHF"]).optional(),
  language: z.string().optional(),
});

const configSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});

export async function hotelRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", async (req) => {
    return prisma.hotel.findFirstOrThrow({
      where: { id: req.user!.hotelId!, deletedAt: null },
      include: { systemConfig: true },
    });
  });

  app.put("/", { preHandler: requireRole("ADMIN") }, async (req, reply) => {
    const body = updateSchema.parse(req.body);
    const before = await prisma.hotel.findFirstOrThrow({ where: { id: req.user!.hotelId! } });
    const hotel = await prisma.hotel.update({ where: { id: before.id }, data: body });
    await writeAudit({
      hotelId: hotel.id,
      userId: req.user!.id,
      entity: "Hotel",
      entityId: hotel.id,
      action: "UPDATE",
      before: before as unknown as Record<string, unknown>,
      after: hotel as unknown as Record<string, unknown>,
    });
    return reply.send(hotel);
  });

  app.put("/config", { preHandler: requireRole("ADMIN") }, async (req, reply) => {
    const body = configSchema.parse(req.body);
    const hotelId = req.user!.hotelId!;
    const config = await prisma.systemConfig.upsert({
      where: { hotelId },
      update: { config: body.config as never },
      create: { hotelId, config: body.config as never },
    });
    await writeAudit({
      hotelId,
      userId: req.user!.id,
      entity: "SystemConfig",
      entityId: config.id,
      action: "UPDATE_CONFIG",
    });
    return reply.send(config);
  });

  // ── Kurtaxe-Konfiguration ──────────────────────────────────
  app.get("/tourist-tax", async (req) => {
    return prisma.touristTaxConfig.findMany({
      where: { hotelId: req.user!.hotelId!, deletedAt: null },
      orderBy: { validFrom: "asc" },
    });
  });

  app.post("/tourist-tax", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        adultCentsPerNight: z.number().int().min(0),
        childUntilAge: z.number().int().min(0).max(18).default(15),
        childCentsPerNight: z.number().int().min(0).default(0),
      })
      .parse(req.body);
    if (body.validFrom >= body.validTo) {
      return reply.code(400).send({ error: "validTo muss nach validFrom liegen" });
    }
    const row = await prisma.touristTaxConfig.create({
      data: {
        hotelId: req.user!.hotelId!,
        name: body.name,
        validFrom: new Date(`${body.validFrom}T00:00:00.000Z`),
        validTo: new Date(`${body.validTo}T00:00:00.000Z`),
        adultCentsPerNight: body.adultCentsPerNight,
        childUntilAge: body.childUntilAge,
        childCentsPerNight: body.childCentsPerNight,
      },
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "TouristTaxConfig", entityId: row.id, action: "CREATE", after: body });
    return reply.code(201).send(row);
  });

  app.delete("/tourist-tax/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = await prisma.touristTaxConfig.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!row) return reply.code(404).send({ error: "Konfiguration nicht gefunden" });
    await prisma.touristTaxConfig.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "TouristTaxConfig", entityId: id, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });
}
