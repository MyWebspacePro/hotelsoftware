import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/auth.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function closingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  /** Kassenbuch: Zahlungen eines Tages. */
  app.get("/payments", async (req) => {
    const { date } = z.object({ date: z.string().regex(DATE_RE) }).parse(req.query);
    const hotelId = req.user!.hotelId!;
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    return prisma.payment.findMany({
      where: { hotelId, deletedAt: null, date: { gte: dayStart, lte: dayEnd } },
      include: {
        invoice: { select: { id: true, number: true, guestName: true } },
        folio: { select: { id: true, bookingId: true, booking: { select: { guest: { select: { firstName: true, lastName: true } } } } } },
      },
      orderBy: { date: "asc" },
    });
  });

  /** Tagesabschluss: aggregiert Zahlungen, Steuern und Folio-Umsätze eines Tages (idempotent). */
  app.post("/close", async (req) => {
    const body = z.object({ date: z.string().regex(DATE_RE) }).parse(req.body);
    const hotelId = req.user!.hotelId!;
    const dayStart = new Date(`${body.date}T00:00:00.000Z`);
    const dayEnd = new Date(`${body.date}T23:59:59.999Z`);

    const [payments, entries] = await Promise.all([
      prisma.payment.findMany({ where: { hotelId, deletedAt: null, date: { gte: dayStart, lte: dayEnd } } }),
      prisma.folioEntry.findMany({
        where: { hotelId, deletedAt: null, createdAt: { gte: dayStart, lte: dayEnd } },
        select: { kind: true, totalCents: true, taxRateKey: true, taxRate: true, isTouristTax: true },
      }),
    ]);

    // Zahlarten
    const byMethod = new Map<string, { method: string; amountCents: number; count: number }>();
    for (const p of payments) {
      const row = byMethod.get(p.method) ?? { method: p.method, amountCents: 0, count: 0 };
      row.amountCents += p.amountCents;
      row.count += 1;
      byMethod.set(p.method, row);
    }

    // Folio-Umsätze
    let chargeCents = 0;
    let creditCents = 0;
    for (const e of entries) {
      if (e.kind === "CHARGE") chargeCents += e.totalCents;
      else creditCents += e.totalCents;
    }

    // Steuer-Summen je Schlüssel (nur CHARGE-Posten; CREDIT separat negativ einbezogen)
    const taxMap = new Map<string, { taxRateKey: string; taxRate: number; netCents: number; taxCents: number }>();
    for (const e of entries) {
      const row = taxMap.get(e.taxRateKey) ?? { taxRateKey: e.taxRateKey, taxRate: e.taxRate, netCents: 0, taxCents: 0 };
      const signed = e.kind === "CHARGE" ? e.totalCents : -e.totalCents;
      row.netCents += signed;
      taxMap.set(e.taxRateKey, row);
    }
    const taxTotals = [...taxMap.values()].map((t) => ({
      ...t,
      taxCents: Math.round(t.netCents * t.taxRate),
    }));

    const closing = await prisma.dayClosing.upsert({
      where: { hotelId_date: { hotelId, date: dayStart } },
      update: {
        totals: { payments: [...byMethod.values()] } as never,
        taxTotals: taxTotals as never,
        folioTotals: { chargeCents, creditCents } as never,
        closedById: req.user!.id,
        closedAt: new Date(),
      },
      create: {
        hotelId,
        date: dayStart,
        totals: { payments: [...byMethod.values()] } as never,
        taxTotals: taxTotals as never,
        folioTotals: { chargeCents, creditCents } as never,
        closedById: req.user!.id,
      },
    });
    return closing;
  });

  /** Tagesabschlüsse im Zeitraum. */
  app.get("/closings", async (req) => {
    const { from, to } = z.object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE) }).parse(req.query);
    return prisma.dayClosing.findMany({
      where: {
        hotelId: req.user!.hotelId!,
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
      },
      orderBy: { date: "desc" },
    });
  });
}
