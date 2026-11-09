import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import {
  buildDatevCsv,
  buildGenericCsv,
  DEFAULT_MAPPING_DATEV,
  DEFAULT_MAPPING_GENERIC,
  type FibuBucketRow,
  type FibuMapping,
} from "@hg/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function upsertDefaultMappings(hotelId: string) {
  await prisma.accountMapping.upsert({
    where: { hotelId_format: { hotelId, format: "DATEV" } },
    update: {},
    create: { hotelId, format: "DATEV", mapping: DEFAULT_MAPPING_DATEV as never },
  });
  await prisma.accountMapping.upsert({
    where: { hotelId_format: { hotelId, format: "GENERIC" } },
    update: {},
    create: { hotelId, format: "GENERIC", mapping: DEFAULT_MAPPING_GENERIC as never },
  });
}

export async function fibuRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/mapping", async (req) => {
    await upsertDefaultMappings(req.user!.hotelId!);
    return prisma.accountMapping.findMany({ where: { hotelId: req.user!.hotelId!, format: { in: ["DATEV", "GENERIC"] } } });
  });

  app.put("/mapping", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const body = z
      .object({
        format: z.enum(["DATEV", "GENERIC"]),
        mapping: z.object({
          debtorAccount: z.string().min(1),
          accounts: z.record(z.string(), z.string().min(1)),
        }),
      })
      .parse(req.body);
    await upsertDefaultMappings(req.user!.hotelId!);
    const row = await prisma.accountMapping.update({
      where: { hotelId_format: { hotelId: req.user!.hotelId!, format: body.format } },
      data: { mapping: body.mapping as never },
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "AccountMapping", entityId: row.id, action: "UPDATE", after: body.mapping });
    return reply.send(row);
  });

  /** Export: Buchungsstapel CSV für Rechnungen im Zeitraum. */
  app.get("/export", async (req, reply) => {
    const { from, to, format } = z
      .object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE), format: z.enum(["DATEV", "GENERIC"]).default("GENERIC") })
      .parse(req.query);
    const hotelId = req.user!.hotelId!;
    await upsertDefaultMappings(hotelId);
    const mappingRow = await prisma.accountMapping.findFirstOrThrow({ where: { hotelId, format } });
    const mapping = mappingRow.mapping as unknown as FibuMapping;

    const invoices = await prisma.invoice.findMany({
      where: {
        hotelId,
        deletedAt: null,
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
        status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"] },
      },
      include: { lines: { orderBy: { position: "asc" } } },
      orderBy: { date: "asc" },
    });

    const rows: FibuBucketRow[] = [];
    for (const inv of invoices) {
      const buckets = new Map<string, { taxRateKey: string; taxRate: number; taxCategory: string; isTouristTax: boolean; netCents: number }>();
      for (const line of inv.lines) {
        const b = buckets.get(line.taxRateKey) ?? {
          taxRateKey: line.taxRateKey,
          taxRate: line.taxRate,
          taxCategory: line.taxCategory,
          isTouristTax: line.isTouristTax,
          netCents: 0,
        };
        b.netCents += line.totalCents;
        buckets.set(line.taxRateKey, b);
      }
      for (const b of buckets.values()) {
        rows.push({
          invoiceNumber: inv.number,
          date: dateToIso(inv.date),
          currency: inv.currency,
          text: `Rechnung ${inv.number} ${inv.guestName ?? ""}`.trim(),
          taxRate: b.taxRate,
          taxCategory: b.taxCategory as "LOGIS" | "FOOD" | "OTHER",
          isTouristTax: b.isTouristTax,
          netCents: b.netCents,
          grossCents: Math.round(b.netCents * (1 + b.taxRate)),
        });
      }
    }

    const csv = format === "DATEV" ? buildDatevCsv(rows, mapping) : buildGenericCsv(rows, mapping);
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="fibu-export-${from}_${to}-${format.toLowerCase()}.csv"`);
    return reply.send(csv);
  });
}

const dateToIso = (d: Date) => d.toISOString().slice(0, 10);
