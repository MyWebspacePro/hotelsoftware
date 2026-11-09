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
}
