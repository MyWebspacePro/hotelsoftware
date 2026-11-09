import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";

const MANAGE = { preHandler: requireRole("ADMIN", "MANAGER") } as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ratePlanSchema = z.object({
  name: z.string().min(1),
  basis: z.enum(["NUR_LOGIS", "UE_F", "HP"]),
  cancellationTerms: z.string().optional(),
  active: z.boolean().optional(),
});

const priceRuleSchema = z.object({
  roomTypeId: z.string().min(1),
  name: z.string().optional(),
  dateFrom: z.string().regex(DATE_RE),
  dateTo: z.string().regex(DATE_RE),
  priceCents: z.number().int().min(0),
  minStay: z.number().int().min(1).optional(),
  stopSell: z.boolean().optional(),
});

export async function pricingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // ── Ratenpläne ─────────────────────────────────────────────
  app.get("/rate-plans", async (req) => {
    return prisma.ratePlan.findMany({
      where: { hotelId: req.user!.hotelId!, deletedAt: null },
      orderBy: { name: "asc" },
    });
  });

  app.post("/rate-plans", MANAGE, async (req, reply) => {
    const body = ratePlanSchema.parse(req.body);
    const rp = await prisma.ratePlan.create({ data: { ...body, hotelId: req.user!.hotelId! } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "RatePlan", entityId: rp.id, action: "CREATE", after: body });
    return reply.code(201).send(rp);
  });

  app.patch("/rate-plans/:id", MANAGE, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = ratePlanSchema.partial().parse(req.body);
    const rp = await prisma.ratePlan.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!rp) return reply.code(404).send({ error: "Ratenplan nicht gefunden" });
    const updated = await prisma.ratePlan.update({ where: { id }, data: body });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "RatePlan", entityId: id, action: "UPDATE", after: body });
    return reply.send(updated);
  });

  app.delete("/rate-plans/:id", MANAGE, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const rp = await prisma.ratePlan.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!rp) return reply.code(404).send({ error: "Ratenplan nicht gefunden" });
    await prisma.ratePlan.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "RatePlan", entityId: id, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });

  // ── Preisregeln (Saisons/Sonderpreise) ─────────────────────
  app.get("/price-rules", async (req) => {
    return prisma.priceRule.findMany({
      where: { hotelId: req.user!.hotelId!, deletedAt: null },
      include: { roomType: { select: { id: true, name: true, color: true } } },
      orderBy: [{ dateFrom: "asc" }],
    });
  });

  app.post("/price-rules", MANAGE, async (req, reply) => {
    const body = priceRuleSchema.parse(req.body);
    if (body.dateFrom >= body.dateTo) {
      return reply.code(400).send({ error: "dateTo muss nach dateFrom liegen" });
    }
    const rt = await prisma.roomType.findFirst({ where: { id: body.roomTypeId, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!rt) return reply.code(400).send({ error: "Zimmertyp existiert nicht" });
    const rule = await prisma.priceRule.create({
      data: {
        hotelId: req.user!.hotelId!,
        roomTypeId: body.roomTypeId,
        name: body.name,
        dateFrom: new Date(`${body.dateFrom}T00:00:00.000Z`),
        dateTo: new Date(`${body.dateTo}T00:00:00.000Z`),
        priceCents: body.priceCents,
        minStay: body.minStay ?? 1,
        stopSell: body.stopSell ?? false,
      },
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "PriceRule", entityId: rule.id, action: "CREATE", after: body });
    return reply.code(201).send(rule);
  });

  app.patch("/price-rules/:id", MANAGE, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = priceRuleSchema.partial().parse(req.body);
    const rule = await prisma.priceRule.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!rule) return reply.code(404).send({ error: "Preisregel nicht gefunden" });
    const data: Record<string, unknown> = { ...body };
    if (body.dateFrom) data.dateFrom = new Date(`${body.dateFrom}T00:00:00.000Z`);
    if (body.dateTo) data.dateTo = new Date(`${body.dateTo}T00:00:00.000Z`);
    if (body.dateFrom && body.dateTo && body.dateFrom >= body.dateTo) {
      return reply.code(400).send({ error: "dateTo muss nach dateFrom liegen" });
    }
    const updated = await prisma.priceRule.update({ where: { id }, data });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "PriceRule", entityId: id, action: "UPDATE", after: body });
    return reply.send(updated);
  });

  app.delete("/price-rules/:id", MANAGE, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const rule = await prisma.priceRule.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!rule) return reply.code(404).send({ error: "Preisregel nicht gefunden" });
    await prisma.priceRule.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "PriceRule", entityId: id, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });
}
