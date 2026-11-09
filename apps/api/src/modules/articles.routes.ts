import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";

const articleSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["FOOD", "DRINK", "SPA", "SKISERVICE", "OTHER"]),
  taxRateKey: z.string().min(1),
  unitPriceCents: z.number().int().min(0),
  chargeToRoom: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function articlesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", async (req) => {
    return prisma.article.findMany({
      where: { hotelId: req.user!.hotelId!, deletedAt: null },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  });

  app.post("/", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const body = articleSchema.parse(req.body);
    const article = await prisma.article.create({ data: { ...body, hotelId: req.user!.hotelId! } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Article", entityId: article.id, action: "CREATE", after: body });
    return reply.code(201).send(article);
  });

  app.patch("/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = articleSchema.partial().parse(req.body);
    const article = await prisma.article.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!article) return reply.code(404).send({ error: "Artikel nicht gefunden" });
    const updated = await prisma.article.update({ where: { id }, data: body });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Article", entityId: id, action: "UPDATE", after: body });
    return reply.send(updated);
  });

  app.delete("/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const article = await prisma.article.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!article) return reply.code(404).send({ error: "Artikel nicht gefunden" });
    await prisma.article.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Article", entityId: id, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });
}
