import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { getCountryRates } from "../lib/postings.js";
import { invoiceTotals, type InvoiceLineInput } from "@hg/shared";

const dateToIso = (d: Date) => d.toISOString().slice(0, 10);

type TxClient = Prisma.TransactionClient;

async function nextInvoiceNumber(tx: TxClient, hotelId: string, prefix: string): Promise<{ number: string; series: string }> {
  const hotel = await tx.hotel.findFirstOrThrow({ where: { id: hotelId } });
  const year = new Date().getFullYear();
  const row = await tx.invoiceSeries.upsert({
    where: { hotelId_country_year: { hotelId, country: hotel.country, year } },
    update: { nextNumber: { increment: 1 } },
    create: { hotelId, country: hotel.country, year, prefix, nextNumber: 2 },
  });
  const number = `${hotel.country}-${year}-${prefix}-${String(row.nextNumber - 1 || 1).padStart(4, "0")}`;
  return { number, series: `${hotel.country}-${year}` };
}

/** Rechnungs-PDF (pdfkit, Standardschriften/WinAnsi — keine Fontdateien nötig). */
async function renderInvoicePdf(invoice: {
  number: string;
  date: Date;
  currency: string;
  type: string;
  guestName: string | null;
  guestAddress: string | null;
  guestZip: string | null;
  guestCity: string | null;
  guestCountry: string | null;
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxBreakdown: unknown;
  lines: Array<{ text: string; qty: number; unitPriceCents: number; totalCents: number; taxRateKey: string }>;
  payments: Array<{ method: string; amountCents: number; date: Date }>;
  hotel: { name: string; address: string | null; zip: string | null; city: string | null; country: string };
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const eur = (c: number) => (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + invoice.currency;
  const win = (s: string) => s.replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  // Absender
  doc.fontSize(10).fillColor("#334155").text(win(invoice.hotel.name), 56, 56);
  if (invoice.hotel.address) doc.text(win(invoice.hotel.address));
  doc.text(`${invoice.hotel.zip ?? ""} ${invoice.hotel.city ?? ""} (${invoice.hotel.country})`);

  // Empfänger
  doc.fontSize(11).fillColor("#0f172a");
  doc.text(win(invoice.guestName ?? "—"), 340, 110);
  if (invoice.guestAddress) doc.text(win(invoice.guestAddress));
  doc.text(`${invoice.guestZip ?? ""} ${invoice.guestCity ?? ""}`.trim());
  if (invoice.guestCountry) doc.text(invoice.guestCountry);

  doc.font("Helvetica-Bold").fontSize(16).text("RECHNUNG", 56, 170);
  doc.font("Helvetica").fontSize(10).fillColor("#334155");
  doc.text(`Nummer: ${invoice.number}`, 56, 195);
  doc.text(`Datum: ${dateToIso(invoice.date)}`);
  if (invoice.type === "CREDIT") doc.text("Gutschrift / Rechnungskorrektur");
  if (invoice.type === "ADVANCE") doc.text("Anzahlungsrechnung");

  // Positionen
  let y = 250;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
  doc.text("Pos", 56, y);
  doc.text("Bezeichnung", 90, y);
  doc.text("Menge", 330, y);
  doc.text("Einzelpreis", 390, y);
  doc.text("Summe", 480, y);
  doc.moveTo(56, y + 14).lineTo(539, y + 14).strokeColor("#94a3b8").stroke();
  y += 22;
  doc.font("Helvetica").fontSize(9);
  invoice.lines.forEach((line, i) => {
    if (y > 700) {
      doc.addPage();
      y = 56;
    }
    doc.fillColor("#0f172a");
    doc.text(String(i + 1), 56, y);
    doc.text(win(line.text.slice(0, 48)), 90, y, { width: 230, ellipsis: true });
    doc.text(String(line.qty), 330, y);
    doc.text(eur(line.unitPriceCents), 390, y);
    doc.text(eur(line.totalCents), 480, y);
    y += 16;
  });

  // Summen
  y += 8;
  doc.moveTo(300, y).lineTo(539, y).strokeColor("#94a3b8").stroke();
  y += 10;
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("Netto:", 300, y);
  doc.text(eur(invoice.netCents), 460, y);
  y += 16;
  doc.font("Helvetica").fontSize(9);
  const buckets = (invoice.taxBreakdown as Array<{ taxRateKey: string; taxRate: number; netCents: number; taxCents: number }>) ?? [];
  for (const b of buckets) {
    const label = b.taxRateKey === "TOURIST_TAX" ? "Kurtaxe (belegfrei)" : `USt ${Math.round(b.taxRate * 1000) / 10} %`;
    doc.text(`${label}:`, 300, y);
    doc.text(eur(b.taxCents), 460, y);
    y += 14;
  }
  doc.font("Helvetica-Bold").fontSize(12);
  doc.text("Gesamt:", 300, y);
  doc.text(eur(invoice.grossCents), 460, y);
  y += 22;

  if (invoice.payments.length > 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    doc.text("Bereits geleistet:", 300, y);
    const paid = invoice.payments.reduce((s, p) => s + p.amountCents, 0);
    doc.text("-" + eur(paid), 460, y);
    y += 16;
    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("Offener Betrag:", 300, y);
    doc.text(eur(invoice.grossCents - paid), 460, y);
  }

  doc.font("Helvetica").fontSize(8).fillColor("#64748b");
  doc.text(
    win("Diese Rechnung wurde elektronisch erstellt. Steuerfreie Kurtaxe nach einschlägigem Landes-/Kommunalrecht separat ausgewiesen."),
    56,
    760,
    { width: 480 },
  );

  doc.end();
  return done;
}

const invoiceInclude = {
  lines: { orderBy: { position: "asc" as const } },
  payments: { where: { deletedAt: null } },
  guest: true,
  hotel: true,
  booking: true,
} as const;

export async function invoicesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/", async (req) => {
    const { status, q, from, to, limit } = req.query as { status?: string; q?: string; from?: string; to?: string; limit?: string };
    return prisma.invoice.findMany({
      where: {
        hotelId: req.user!.hotelId!,
        deletedAt: null,
        ...(status ? { status: status as never } : {}),
        ...(q ? { OR: [{ number: { contains: q } }, { guestName: { contains: q, mode: "insensitive" } }] } : {}),
        ...(from && to ? { date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } : {}),
      },
      select: { id: true, number: true, type: true, status: true, guestName: true, currency: true, date: true, netCents: true, taxCents: true, grossCents: true, bookingId: true },
      orderBy: { date: "desc" },
      take: limit ? Number(limit) : 100,
    });
  });

  app.get("/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const invoice = await prisma.invoice.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null }, include: invoiceInclude });
    if (!invoice) return reply.code(404).send({ error: "Rechnung nicht gefunden" });
    return invoice;
  });

  /** Rechnung aus offenen Folio-Posten erstellen. */
  app.post("/from-folio", async (req, reply) => {
    const hotelId = req.user!.hotelId!;
    const body = z.object({ folioId: z.string(), type: z.enum(["STANDARD"]).default("STANDARD") }).parse(req.body);
    const folio = await prisma.folioAccount.findFirst({
      where: { id: body.folioId, hotelId, deletedAt: null },
      include: { entries: { where: { deletedAt: null, invoiceId: null }, orderBy: { createdAt: "asc" } }, booking: { include: { guest: true } } },
    });
    if (!folio) return reply.code(404).send({ error: "Konto nicht gefunden" });
    const open = folio.entries;
    if (open.length === 0) return reply.code(400).send({ error: "Keine offenen Posten auf diesem Konto" });

    const lines: InvoiceLineInput[] = open.map((e) => ({
      text: e.text,
      qty: e.qty,
      unitPriceCents: e.unitPriceCents,
      taxRate: e.taxRate,
      taxRateKey: e.taxRateKey,
      taxCategory: e.taxCategory as "LOGIS" | "FOOD" | "OTHER",
      isTouristTax: e.isTouristTax,
    }));
    const hotel = await prisma.hotel.findFirstOrThrow({ where: { id: hotelId } });
    const totals = invoiceTotals(lines, { currency: hotel.currency as "EUR" | "CHF" });

    let number = "";
    let series = "";
    const guest = folio.booking?.guest ?? null;
    const invoice = await prisma.$transaction(async (tx) => {
      ({ number, series } = await nextInvoiceNumber(tx, hotelId, "RE"));
      const created = await tx.invoice.create({
        data: {
          hotelId,
          number,
          series,
          type: "STANDARD",
          status: "ISSUED",
          bookingId: folio.bookingId,
          folioId: folio.id,
          guestId: guest?.id,
          guestName: guest ? `${guest.firstName} ${guest.lastName}` : folio.title,
          currency: hotel.currency,
          date: new Date(),
          netCents: totals.netCents,
          taxCents: totals.taxCents,
          grossCents: totals.grossCents,
          taxBreakdown: totals.buckets as never,
          lines: {
            create: totals.lines.map((l, i) => ({
              position: i + 1,
              text: l.text,
              qty: l.qty,
              unitPriceCents: l.unitPriceCents,
              totalCents: l.totalCents,
              taxRateKey: l.taxRateKey,
              taxRate: l.taxRate,
              taxCategory: l.taxCategory,
              isTouristTax: l.isTouristTax ?? false,
            })),
          },
        },
      });
      await tx.folioEntry.updateMany({ where: { id: { in: open.map((e) => e.id) } }, data: { invoiceId: created.id } });
      // Offene Konto-Zahlungen der Rechnung zuordnen
      const payments = await tx.payment.findMany({ where: { folioId: folio.id, invoiceId: null, deletedAt: null } });
      const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
      if (payments.length > 0) {
        await tx.payment.updateMany({ where: { id: { in: payments.map((p) => p.id) } }, data: { invoiceId: created.id } });
      }
      return tx.invoice.update({
        where: { id: created.id },
        data: { status: paidCents >= created.grossCents ? "PAID" : paidCents > 0 ? "PARTIALLY_PAID" : "ISSUED" },
        include: invoiceInclude,
      });
    });

    await writeAudit({ hotelId, userId: req.user!.id, entity: "Invoice", entityId: invoice.id, action: "CREATE_FROM_FOLIO", after: { number, grossCents: invoice.grossCents } });
    return reply.code(201).send(invoice);
  });

  /** Anzahlungsrechnung: Betrag als Position, Zahlung direkt erfasst. */
  app.post("/advance", async (req, reply) => {
    const hotelId = req.user!.hotelId!;
    const body = z
      .object({
        bookingId: z.string(),
        amountCents: z.number().int().min(1),
        method: z.enum(["CASH", "CARD", "SEPA", "ONLINE", "VOUCHER", "TRANSFER"]),
        reference: z.string().optional(),
      })
      .parse(req.body);
    const booking = await prisma.booking.findFirst({ where: { id: body.bookingId, hotelId, deletedAt: null }, include: { guest: true, reservations: { where: { deletedAt: null } } } });
    if (!booking) return reply.code(404).send({ error: "Buchung nicht gefunden" });
    const hotel = await prisma.hotel.findFirstOrThrow({ where: { id: hotelId } });

    const { ensureFolio } = await import("../lib/postings.js");
    const folio = await ensureFolio(hotelId, booking.id);
    const { rates } = await getCountryRates(hotelId);
    const firstRes = booking.reservations[0];
    const line: InvoiceLineInput = {
      text: `Anzahlung auf Reservation${firstRes ? ` ${dateToIso(firstRes.dateFrom)}–${dateToIso(firstRes.dateTo)}` : ""}`,
      qty: 1,
      unitPriceCents: body.amountCents,
      taxRate: rates.logis.rate,
      taxRateKey: rates.logis.key,
      taxCategory: "LOGIS",
    };
    const totals = invoiceTotals([line], { currency: hotel.currency as "EUR" | "CHF" });

    let number = "";
    let series = "";
    const invoice = await prisma.$transaction(async (tx) => {
      ({ number, series } = await nextInvoiceNumber(tx, hotelId, "AN"));
      const created = await tx.invoice.create({
        data: {
          hotelId,
          number,
          series,
          type: "ADVANCE",
          status: "PAID",
          bookingId: booking.id,
          folioId: folio.id,
          guestId: booking.guestId,
          guestName: booking.guest ? `${booking.guest.firstName} ${booking.guest.lastName}` : null,
          currency: hotel.currency,
          date: new Date(),
          netCents: totals.netCents,
          taxCents: totals.taxCents,
          grossCents: totals.grossCents,
          taxBreakdown: totals.buckets as never,
          lines: {
            create: [{ position: 1, text: line.text, qty: 1, unitPriceCents: body.amountCents, totalCents: body.amountCents, taxRateKey: line.taxRateKey, taxRate: line.taxRate, taxCategory: "LOGIS", isTouristTax: false }],
          },
        },
      });
      await tx.payment.create({
        data: {
          hotelId,
          folioId: folio.id,
          invoiceId: created.id,
          method: body.method,
          amountCents: body.amountCents,
          date: new Date(),
          reference: body.reference,
          note: "Anzahlung",
          createdById: req.user!.id,
        },
      });
      return tx.invoice.findFirstOrThrow({ where: { id: created.id }, include: invoiceInclude });
    });
    await writeAudit({ hotelId, userId: req.user!.id, entity: "Invoice", entityId: invoice.id, action: "CREATE_ADVANCE", after: { number, amountCents: body.amountCents } });
    return reply.code(201).send(invoice);
  });

  /** Storno: Gutschrift mit negierten Positionen, Original wird CANCELLED. */
  app.post("/:id/cancel", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const hotelId = req.user!.hotelId!;
    const original = await prisma.invoice.findFirst({ where: { id, hotelId, deletedAt: null }, include: { lines: true } });
    if (!original) return reply.code(404).send({ error: "Rechnung nicht gefunden" });
    if (original.status === "CANCELLED") return reply.code(400).send({ error: "Rechnung ist bereits storniert" });

    const paidAgg = await prisma.payment.aggregate({
      where: { invoiceId: original.id, deletedAt: null },
      _sum: { amountCents: true },
    });
    const refundCents = paidAgg._sum.amountCents ?? 0;

    let number = "";
    let series = "";
    const credit = await prisma.$transaction(async (tx) => {
      ({ number, series } = await nextInvoiceNumber(tx, hotelId, "ST"));
      const created = await tx.invoice.create({
        data: {
          hotelId,
          number,
          series,
          type: "CREDIT",
          // Nur "bezahlt", wenn die zugehörige Rückerstattung vollständig erfasst ist.
          status: refundCents <= 0 ? "ISSUED" : Math.abs(refundCents) >= Math.abs(original.grossCents) ? "PAID" : "PARTIALLY_PAID",
          bookingId: original.bookingId,
          folioId: original.folioId,
          guestId: original.guestId,
          guestName: original.guestName,
          currency: original.currency,
          date: new Date(),
          netCents: -original.netCents,
          taxCents: -original.taxCents,
          grossCents: -original.grossCents,
          taxBreakdown: (original.taxBreakdown as unknown[]).map((b) => {
            const bucket = b as { taxRateKey: string; taxRate: number; netCents: number; taxCents: number; taxCategory?: string; isTouristTax?: boolean };
            return { ...bucket, netCents: -bucket.netCents, taxCents: -bucket.taxCents };
          }) as never,
          lines: {
            create: original.lines.map((l, i) => ({
              position: i + 1,
              text: l.text,
              qty: -l.qty,
              unitPriceCents: l.unitPriceCents,
              totalCents: -l.totalCents,
              taxRateKey: l.taxRateKey,
              taxRate: l.taxRate,
              taxCategory: l.taxCategory,
              isTouristTax: l.isTouristTax,
            })),
          },
          cancelOfId: original.id,
        },
      });
      if (refundCents > 0) {
        // Negative Zahlung = Rückerstattung; hält Kassenbuch und Summen konsistent.
        await tx.payment.create({
          data: {
            hotelId,
            folioId: original.folioId,
            invoiceId: created.id,
            method: "TRANSFER",
            amountCents: -refundCents,
            date: new Date(),
            reference: `Rückerstattung ${original.number}`,
            note: "Rückerstattung aus Storno",
            createdById: req.user!.id,
          },
        });
      }
      await tx.invoice.update({ where: { id: original.id }, data: { status: "CANCELLED" } });
      return tx.invoice.findFirstOrThrow({ where: { id: created.id }, include: invoiceInclude });
    });
    await writeAudit({ hotelId, userId: req.user!.id, entity: "Invoice", entityId: credit.id, action: "CANCEL_INVOICE", after: { cancelOf: original.number, creditNumber: number } });
    return reply.code(201).send(credit);
  });

  /** Zahlung auf bestehende Rechnung (Restzahlung beim Check-out). */
  app.post("/:id/payments", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const hotelId = req.user!.hotelId!;
    const body = z.object({
      method: z.enum(["CASH", "CARD", "SEPA", "ONLINE", "VOUCHER", "TRANSFER"]),
      amountCents: z.number().int().min(1),
      reference: z.string().optional(),
    }).parse(req.body);
    const invoice = await prisma.invoice.findFirst({ where: { id, hotelId, deletedAt: null } });
    if (!invoice) return reply.code(404).send({ error: "Rechnung nicht gefunden" });
    if (invoice.type === "CREDIT") {
      return reply.code(400).send({ error: `Zahlungen auf Gutschriften bitte als negative Zahlung erfassen (Storno ${invoice.number})` });
    }
    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: { hotelId, folioId: invoice.folioId, invoiceId: invoice.id, method: body.method, amountCents: body.amountCents, date: new Date(), reference: body.reference, createdById: req.user!.id },
      });
      const paid = await tx.payment.aggregate({ where: { invoiceId: invoice.id, deletedAt: null }, _sum: { amountCents: true } });
      const paidCents = paid._sum.amountCents ?? 0;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: paidCents >= invoice.grossCents ? "PAID" : "PARTIALLY_PAID" },
      });
      return p;
    });
    await writeAudit({ hotelId, userId: req.user!.id, entity: "Payment", entityId: payment.id, action: "CREATE", after: { invoiceId: id, amountCents: body.amountCents } });
    return reply.code(201).send(payment);
  });

  /** Rechnungs-PDF. */
  app.get("/:id/pdf", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const invoice = await prisma.invoice.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null }, include: { lines: { orderBy: { position: "asc" } }, payments: { where: { deletedAt: null } }, guest: true, hotel: true } });
    if (!invoice) return reply.code(404).send({ error: "Rechnung nicht gefunden" });
    const pdf = await renderInvoicePdf({
      number: invoice.number,
      date: invoice.date,
      currency: invoice.currency,
      type: invoice.type,
      guestName: invoice.guestName,
      guestAddress: invoice.guest?.address ?? null,
      guestZip: invoice.guest?.zip ?? null,
      guestCity: invoice.guest?.city ?? null,
      guestCountry: invoice.guest?.country ?? null,
      netCents: invoice.netCents,
      taxCents: invoice.taxCents,
      grossCents: invoice.grossCents,
      taxBreakdown: invoice.taxBreakdown,
      lines: invoice.lines,
      payments: invoice.payments,
      hotel: invoice.hotel,
    });
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="${invoice.number}.pdf"`);
    return reply.send(pdf);
  });
}
