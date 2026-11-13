import type { FastifyInstance } from "fastify";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { generateRegistrationRecords } from "../lib/registrations.js";
import {
  FIELD_LABELS,
  missingFields,
  REGISTRATION_PROFILES,
  type CountryCode,
  type RegistrationDataLike,
} from "@hg/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateToIso = (d: Date) => d.toISOString().slice(0, 10);
const win = (s: string) => s.replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

function recordToData(r: {
  fullName: string | null;
  birthDate: Date | null;
  nationality: string | null;
  idType: string | null;
  idNumber: string | null;
  address: string | null;
}): RegistrationDataLike {
  return {
    fullName: r.fullName,
    birthDate: r.birthDate ? dateToIso(r.birthDate) : null,
    nationality: r.nationality,
    idType: r.idType,
    idNumber: r.idNumber,
    address: r.address,
  };
}

/** Meldeschein-Formular: eine Seite je Datensatz. */
async function renderMeldescheinPdf(records: Array<Record<string, unknown> & { country: string }>): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  for (const [i, r] of records.entries()) {
    if (i > 0) doc.addPage();
    const profile = REGISTRATION_PROFILES[r.country as CountryCode];
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#0f172a").text("MELDESCHEIN", 56, 56);
    doc.font("Helvetica").fontSize(9).fillColor("#334155").text(win(profile.label), 56, 80);
    doc.text(win(profile.legalNote), 56, 94, { width: 480 });

    const rows: Array<[string, string]> = [
      ["Name", String(r.fullName ?? "—")],
      ["Geburtsdatum", r.birthDate ? dateToIso(r.birthDate as Date) : "—"],
      ["Staatsangehörigkeit", String(r.nationality ?? "—")],
      ["Ausweisart", String(r.idType ?? "—")],
      ["Ausweis-Nr.", String(r.idNumber ?? "—")],
      ["Anschrift", String(r.address ?? "—")],
      ["Ankunft", dateToIso(r.arrival as Date)],
      ["Abreise", dateToIso(r.departure as Date)],
      ["Aufenthaltsort", String(r.hotelName ?? "—")],
    ];
    let y = 140;
    for (const [label, value] of rows) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text(label, 56, y);
      doc.font("Helvetica").text(win(value), 220, y, { width: 300 });
      doc.moveTo(56, y + 16).lineTo(539, y + 16).strokeColor("#e2e8f0").stroke();
      y += 24;
    }
    doc.fontSize(8).fillColor("#64748b");
    doc.text(win("Aufbewahrung laut Profil; danach Anonymisierung/Vernichtung (DSGVO-Löschlauf)."), 56, 760, { width: 480 });
  }
  doc.end();
  return done;
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function registrationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/profiles", async (req) => {
    const hotel = await prisma.hotel.findFirstOrThrow({ where: { id: req.user!.hotelId! } });
    const profile = REGISTRATION_PROFILES[hotel.country as CountryCode];
    return { profile, fieldLabels: FIELD_LABELS, hotelCountry: hotel.country };
  });

  app.get("/", async (req) => {
    const { status, from, to, reservationId, q } = req.query as {
      status?: string;
      from?: string;
      to?: string;
      reservationId?: string;
      q?: string;
    };
    return prisma.registrationRecord.findMany({
      where: {
        hotelId: req.user!.hotelId!,
        ...(status ? { status: status as never } : {}),
        ...(reservationId ? { reservationId } : {}),
        ...(from && to ? { departure: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } } : {}),
        ...(q ? { fullName: { contains: q, mode: "insensitive" } } : {}),
      },
      include: {
        guest: { select: { id: true, email: true, phone: true } },
        reservation: { select: { id: true, adults: true, children: true, roomTypeId: true } },
      },
      orderBy: { arrival: "desc" },
      take: 300,
    });
  });

  app.get("/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const record = await prisma.registrationRecord.findFirst({ where: { id, hotelId: req.user!.hotelId! } });
    if (!record) return reply.code(404).send({ error: "Meldeschein nicht gefunden" });
    return record;
  });

  /** Datensatz nachbessern (z. B. Ausweisdaten beim Check-in erfassen). */
  app.patch("/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z
      .object({
        fullName: z.string().min(1).optional(),
        birthDate: z.string().regex(DATE_RE).optional().or(z.literal("")),
        nationality: z.string().optional(),
        idType: z.string().optional(),
        idNumber: z.string().optional(),
        address: z.string().optional(),
      })
      .parse(req.body);
    const record = await prisma.registrationRecord.findFirst({ where: { id, hotelId: req.user!.hotelId! } });
    if (!record) return reply.code(404).send({ error: "Meldeschein nicht gefunden" });
    const updated = await prisma.registrationRecord.update({
      where: { id },
      data: {
        ...(body.fullName ? { fullName: body.fullName } : {}),
        ...(body.birthDate !== undefined ? { birthDate: body.birthDate ? new Date(`${body.birthDate}T00:00:00.000Z`) : null } : {}),
        ...(body.nationality !== undefined ? { nationality: body.nationality || null } : {}),
        ...(body.idType !== undefined ? { idType: body.idType || null } : {}),
        ...(body.idNumber !== undefined ? { idNumber: body.idNumber || null } : {}),
        ...(body.address !== undefined ? { address: body.address || null } : {}),
      },
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "RegistrationRecord", entityId: id, action: "UPDATE", after: { fullName: updated.fullName } });
    return reply.send(updated);
  });

  /** Records für eine Buchung/Reservierung erzeugen bzw. aktualisieren. */
  app.post("/generate", async (req, reply) => {
    const body = z.object({ bookingId: z.string() }).parse(req.body);
    const result = await generateRegistrationRecords(req.user!.hotelId!, body.bookingId);
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "RegistrationRecord", action: "GENERATE", after: { ...result } });
    return reply.send(result);
  });

  app.post("/:id/submit", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const record = await prisma.registrationRecord.findFirst({ where: { id, hotelId: req.user!.hotelId! } });
    if (!record) return reply.code(404).send({ error: "Meldeschein nicht gefunden" });
    const updated = await prisma.registrationRecord.update({ where: { id }, data: { status: "SUBMITTED", exportedAt: new Date() } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "RegistrationRecord", entityId: id, action: "SUBMIT" });
    return reply.send(updated);
  });

  /** Exporte: DE-Meldeschein-PDF, AT Gästeblatt/Statistik, CH Kantons-CSV. */
  app.post("/export", async (req, reply) => {
    const hotelId = req.user!.hotelId!;
    const body = z
      .object({
        type: z.enum(["DE_MELDESCHEIN_PDF", "AT_GAESTEBLATT_CSV", "AT_STATISTIK_MONAT_CSV", "CH_CANTON_CSV"]),
        from: z.string().regex(DATE_RE).optional(),
        to: z.string().regex(DATE_RE).optional(),
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      })
      .parse(req.body);
    if (body.type === "AT_STATISTIK_MONAT_CSV" && !body.month) {
      return reply.code(400).send({ error: "month (YYYY-MM) erforderlich" });
    }

    const hotel = await prisma.hotel.findFirstOrThrow({ where: { id: hotelId } });
    const periodFrom = body.type === "AT_STATISTIK_MONAT_CSV" ? `${body.month!}-01` : body.from;
    const periodTo =
      body.type === "AT_STATISTIK_MONAT_CSV" ? monthEndIso(body.month!) : body.to;
    const periodToExclusive = periodTo ? addDaysIso(periodTo, 1) : undefined;

    const records = await prisma.registrationRecord.findMany({
      where: {
        hotelId,
        anonymizedAt: null,
        ...(body.type === "AT_STATISTIK_MONAT_CSV"
          ? {
              arrival: {
                gte: new Date(`${periodFrom}T00:00:00.000Z`),
                lt: new Date(`${periodToExclusive}T00:00:00.000Z`),
              },
            }
          : periodFrom && periodTo
            ? { departure: { gte: new Date(`${periodFrom}T00:00:00.000Z`), lt: new Date(`${periodToExclusive}T00:00:00.000Z`) } }
            : {}),
      },
      include: { hotel: { select: { name: true } } },
      orderBy: { arrival: "asc" },
    });

    let content: string | Buffer;
    let filename: string;
    let contentType: string;

    if (body.type === "DE_MELDESCHEIN_PDF") {
      content = await renderMeldescheinPdf(records.map((r) => ({ ...r, hotelName: hotel.name })));
      filename = `meldescheine_${periodFrom ?? "alle"}_${periodTo ?? ""}.pdf`;
      contentType = "application/pdf";
    } else if (body.type === "AT_GAESTEBLATT_CSV") {
      const lines = ["Nachname;Vorname;Geburtsdatum;Staatsangehörigkeit;Ausweisart;Ausweisnummer;Anschrift;Ankunft;Abreise;Unterkunft"];
      for (const r of records) {
        lines.push(
          [
            r.fullName.split(" ").slice(-1)[0] ?? "",
            r.fullName.split(" ").slice(0, -1).join(" "),
            r.birthDate ? dateToIso(r.birthDate) : "",
            r.nationality ?? "",
            r.idType ?? "",
            r.idNumber ?? "",
            r.address ?? "",
            dateToIso(r.arrival),
            dateToIso(r.departure),
            hotel.name,
          ]
            .map((v) => csvEscape(String(v)))
            .join(";"),
        );
      }
      content = lines.join("\r\n") + "\r\n";
      filename = `gaesteblatt_${periodFrom}_${periodTo}.csv`;
      contentType = "text/csv; charset=utf-8";
    } else if (body.type === "AT_STATISTIK_MONAT_CSV") {
      // Statistik-Austria-Monatsmeldung: Ankünfte + Nächtigungen je Herkunftsland
      const month = body.month!;
      const monthStart = new Date(`${month}-01T00:00:00.000Z`);
      const monthEnd = new Date(`${month}-31T23:59:59.999Z`);
      const byCountry = new Map<string, { arrivals: number; nights: number }>();
      for (const r of records) {
        const country = r.nationality ?? "UNBEKANNT";
        const row = byCountry.get(country) ?? { arrivals: 0, nights: 0 };
        if (r.arrival >= monthStart && r.arrival <= monthEnd) row.arrivals += 1;
        // Nächtigungen des Aufenthalts im Monat (Überlappung)
        const stayStart = Math.max(r.arrival.getTime(), monthStart.getTime());
        const stayEnd = Math.min(r.departure.getTime(), monthEnd.getTime());
        const nights = Math.max(0, Math.round((stayEnd - stayStart) / 86400000));
        row.nights += nights;
        byCountry.set(country, row);
      }
      const lines = ["Berichtsmonat;Herkunftsland;Ankuenfte;Naechtigungen"];
      for (const [country, row] of [...byCountry.entries()].sort()) {
        lines.push(`${month};${country};${row.arrivals};${row.nights}`);
      }
      content = lines.join("\r\n") + "\r\n";
      filename = `statistik_at_${month}.csv`;
      contentType = "text/csv; charset=utf-8";
    } else {
      // CH_CANTON_CSV
      const lines = ["Nachname;Vorname;Geburtsdatum;Nationalitaet;Ausweisart;Ausweisnummer;Ankunft;Abreise;Unterkunft"];
      for (const r of records) {
        lines.push(
          [
            r.fullName.split(" ").slice(-1)[0] ?? "",
            r.fullName.split(" ").slice(0, -1).join(" "),
            r.birthDate ? dateToIso(r.birthDate) : "",
            r.nationality ?? "",
            r.idType ?? "",
            r.idNumber ?? "",
            dateToIso(r.arrival),
            dateToIso(r.departure),
            hotel.name,
          ]
            .map((v) => csvEscape(String(v)))
            .join(";"),
        );
      }
      content = lines.join("\r\n") + "\r\n";
      filename = `gaestekontrolle_ch_${periodFrom}_${periodTo}.csv`;
      contentType = "text/csv; charset=utf-8";
    }

    await prisma.registrationExport.create({
      data: {
        hotelId,
        type: body.type,
        periodFrom: periodFrom ? new Date(`${periodFrom}T00:00:00.000Z`) : null,
        periodTo: periodTo ? new Date(`${periodTo}T00:00:00.000Z`) : body.month ? new Date(`${monthEndIso(body.month)}T00:00:00.000Z`) : null,
        recordCount: records.length,
        generatedById: req.user!.id,
      },
    });
    await writeAudit({ hotelId, userId: req.user!.id, entity: "RegistrationExport", action: "EXPORT", after: { type: body.type, count: records.length } });

    reply.header("Content-Type", contentType);
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(content);
  });

  app.get("/exports", async (req) => {
    return prisma.registrationExport.findMany({
      where: { hotelId: req.user!.hotelId! },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });
}

function monthEndIso(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
