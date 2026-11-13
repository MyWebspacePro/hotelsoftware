import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { getCountryRates } from "../lib/postings.js";

const folioInclude = {
  entries: { where: { deletedAt: null }, orderBy: { createdAt: "asc" as const } },
  payments: { where: { deletedAt: null }, orderBy: { date: "asc" as const } },
  booking: { select: { id: true, status: true, guest: { select: { id: true, firstName: true, lastName: true, email: true, address: true, zip: true, city: true, country: true } } } },
} as const;

export async function foliosRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", async (req) => {
    const { bookingId, open } = req.query as { bookingId?: string; open?: string };
    return prisma.folioAccount.findMany({
      where: {
        hotelId: req.user!.hotelId!,
        deletedAt: null,
        ...(bookingId ? { bookingId } : {}),
        ...(open === "true" ? { open: true } : {}),
      },
      include: folioInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  app.get("/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const folio = await prisma.folioAccount.findFirst({
      where: { id, hotelId: req.user!.hotelId!, deletedAt: null },
      include: folioInclude,
    });
    if (!folio) return reply.code(404).send({ error: "Konto nicht gefunden" });
    return folio;
  });

  /** Verzehr/Leistung aufs Konto: per Artikel oder Freitext mit Steuerschlüssel. */
  app.post("/:id/entries", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const hotelId = req.user!.hotelId!;
    const body = z
      .object({
        articleId: z.string().optional(),
        text: z.string().optional(),
        qty: z.number().int().min(1).default(1),
        unitPriceCents: z.number().int().min(0).optional(),
        taxRateKey: z.string().optional(),
        nightDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(req.body);

    const folio = await prisma.folioAccount.findFirst({ where: { id, hotelId, deletedAt: null } });
    if (!folio) return reply.code(404).send({ error: "Konto nicht gefunden" });

    let text: string;
    let unitPriceCents: number;
    let taxRateKey: string;

    if (body.articleId) {
      const article = await prisma.article.findFirst({ where: { id: body.articleId, hotelId, deletedAt: null } });
      if (!article) return reply.code(400).send({ error: "Artikel nicht gefunden" });
      text = article.name;
      unitPriceCents = article.unitPriceCents;
      taxRateKey = article.taxRateKey;
    } else {
      if (!body.text || body.unitPriceCents === undefined || !body.taxRateKey) {
        return reply.code(400).send({ error: "Freitext-Posten braucht text, unitPriceCents und taxRateKey" });
      }
      text = body.text;
      unitPriceCents = body.unitPriceCents;
      taxRateKey = body.taxRateKey;
    }

    // Steuersatz aus Länder-Matrix auflösen (Kurtaxe 0 %)
    let taxRate = 0;
    const { rates } = await getCountryRates(hotelId);
    const all = [rates.logis, rates.food, rates.other];
    // Kategorie-Kürzel aus dem Frontend auf den echten Länder-Key mappen
    if (taxRateKey === "MANUAL_LOGIS") taxRateKey = rates.logis.key;
    else if (taxRateKey === "MANUAL_FOOD") taxRateKey = rates.food.key;
    else if (taxRateKey === "MANUAL_OTHER") taxRateKey = rates.other.key;
    if (taxRateKey !== "TOURIST_TAX") {
      const rate = all.find((r) => r.key === taxRateKey);
      if (!rate) {
        return reply.code(400).send({ error: `Unbekannter Steuerschlüssel: ${taxRateKey}` });
      }
      taxRate = rate.rate;
    }
    const category =
      taxRateKey === "TOURIST_TAX"
        ? "OTHER"
        : taxRateKey === rates.logis.key
          ? "LOGIS"
          : taxRateKey === rates.food.key
            ? "FOOD"
            : "OTHER";

    const entry = await prisma.folioEntry.create({
      data: {
        hotelId,
        folioId: id,
        kind: "CHARGE",
        articleId: body.articleId,
        text,
        qty: body.qty,
        unitPriceCents,
        totalCents: body.qty * unitPriceCents,
        taxRateKey,
        taxRate,
        taxCategory: category,
        nightDate: body.nightDate ? new Date(`${body.nightDate}T00:00:00.000Z`) : null,
        source: "MANUAL",
      },
    });
    await writeAudit({ hotelId, userId: req.user!.id, entity: "FolioEntry", entityId: entry.id, action: "CREATE", after: { folioId: id, text, totalCents: entry.totalCents } });
    return reply.code(201).send(entry);
  });

  app.delete("/entries/:entryId", async (req, reply) => {
    const entryId = (req.params as { entryId: string }).entryId;
    const entry = await prisma.folioEntry.findFirst({ where: { id: entryId, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!entry) return reply.code(404).send({ error: "Posten nicht gefunden" });
    if (entry.invoiceId) return reply.code(409).send({ error: "Posten ist bereits fakturiert" });
    await prisma.folioEntry.update({ where: { id: entryId }, data: { deletedAt: new Date() } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "FolioEntry", entityId: entryId, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });

  /** Zahlung aufs Konto (Anzahlung oder Teilzahlung). */
  app.post("/:id/payments", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const hotelId = req.user!.hotelId!;
    const body = z
      .object({
        method: z.enum(["CASH", "CARD", "SEPA", "ONLINE", "VOUCHER", "TRANSFER"]),
        amountCents: z.number().int().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        reference: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(req.body);
    const folio = await prisma.folioAccount.findFirst({ where: { id, hotelId, deletedAt: null } });
    if (!folio) return reply.code(404).send({ error: "Konto nicht gefunden" });
    const payment = await prisma.payment.create({
      data: {
        hotelId,
        folioId: id,
        method: body.method,
        amountCents: body.amountCents,
        date: body.date ? new Date(`${body.date}T12:00:00.000Z`) : new Date(),
        reference: body.reference,
        note: body.note,
        createdById: req.user!.id,
      },
    });
    await writeAudit({ hotelId, userId: req.user!.id, entity: "Payment", entityId: payment.id, action: "CREATE", after: { folioId: id, method: body.method, amountCents: body.amountCents } });
    return reply.code(201).send(payment);
  });
}
