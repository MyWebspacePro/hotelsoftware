import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { inclusiveDays } from "@hg/shared";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEPARTMENTS = ["RECEPTION", "KITCHEN", "SERVICE", "HOUSEKEEPING", "TECH", "WELLNESS", "ADMIN"] as const;
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dateToIso = (d: Date) => d.toISOString().slice(0, 10);

export async function staffRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // ── Mitarbeiter ────────────────────────────────────────────
  app.get("/employees", async (req) => {
    return prisma.employee.findMany({
      where: { hotelId: req.user!.hotelId!, deletedAt: null },
      orderBy: [{ department: "asc" }, { name: "asc" }],
    });
  });

  app.post("/employees", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        department: z.enum(DEPARTMENTS),
        vacationQuotaDays: z.number().int().min(0).max(365).default(25),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const employee = await prisma.employee.create({ data: { ...body, hotelId: req.user!.hotelId! } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Employee", entityId: employee.id, action: "CREATE", after: { name: body.name, department: body.department } });
    return reply.code(201).send(employee);
  });

  app.patch("/employees/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z
      .object({
        name: z.string().min(1).optional(),
        department: z.enum(DEPARTMENTS).optional(),
        vacationQuotaDays: z.number().int().min(0).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const employee = await prisma.employee.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!employee) return reply.code(404).send({ error: "Mitarbeiter nicht gefunden" });
    return prisma.employee.update({ where: { id }, data: body });
  });

  app.delete("/employees/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    await prisma.employee.updateMany({ where: { id, hotelId: req.user!.hotelId! }, data: { deletedAt: new Date(), active: false } });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Employee", entityId: id, action: "SOFT_DELETE" });
    return reply.send({ ok: true });
  });

  // ── Schichtvorlagen ────────────────────────────────────────
  app.get("/templates", async (req) => {
    return prisma.shiftTemplate.findMany({
      where: { hotelId: req.user!.hotelId!, deletedAt: null },
      orderBy: { department: "asc" },
    });
  });

  app.post("/templates", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const body = z
      .object({ name: z.string().min(1), department: z.enum(DEPARTMENTS), fromTime: z.string().regex(/^\d{2}:\d{2}$/), toTime: z.string().regex(/^\d{2}:\d{2}$/) })
      .parse(req.body);
    return reply.code(201).send(await prisma.shiftTemplate.create({ data: { ...body, hotelId: req.user!.hotelId! } }));
  });

  app.delete("/templates/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    await prisma.shiftTemplate.updateMany({ where: { id, hotelId: req.user!.hotelId! }, data: { deletedAt: new Date() } });
    return reply.send({ ok: true });
  });

  // ── Dienstplan (Schichten) ─────────────────────────────────
  app.get("/shifts", async (req) => {
    const { from, to } = z.object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE) }).parse(req.query);
    return prisma.shift.findMany({
      where: {
        hotelId: req.user!.hotelId!,
        deletedAt: null,
        date: { gte: isoToDate(from), lte: isoToDate(to) },
      },
      include: { assignments: { include: { employee: { select: { id: true, name: true } } } } },
      orderBy: [{ date: "asc" }, { fromTime: "asc" }],
    });
  });

  app.post("/shifts", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const body = z
      .object({
        date: z.string().regex(DATE_RE),
        department: z.enum(DEPARTMENTS),
        fromTime: z.string().regex(/^\d{2}:\d{2}$/),
        toTime: z.string().regex(/^\d{2}:\d{2}$/),
        employeeIds: z.array(z.string()).default([]),
        note: z.string().optional(),
      })
      .parse(req.body);
    const hotelId = req.user!.hotelId!;
    if (body.employeeIds.length) {
      const found = await prisma.employee.count({
        where: { id: { in: body.employeeIds }, hotelId, deletedAt: null },
      });
      if (found !== body.employeeIds.length) {
        return reply.code(400).send({ error: "Mitarbeiter gehören nicht zum Hotel" });
      }
    }
    const shift = await prisma.shift.create({
      data: {
        hotelId,
        date: isoToDate(body.date),
        department: body.department,
        fromTime: body.fromTime,
        toTime: body.toTime,
        note: body.note,
        assignments: { create: body.employeeIds.map((employeeId) => ({ employeeId })) },
      },
      include: { assignments: { include: { employee: { select: { id: true, name: true } } } } },
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "Shift", entityId: shift.id, action: "CREATE", after: { date: body.date, department: body.department, employees: body.employeeIds.length } });
    return reply.code(201).send(shift);
  });

  app.patch("/shifts/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z
      .object({
        fromTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        toTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        employeeIds: z.array(z.string()).optional(),
        note: z.string().optional(),
      })
      .parse(req.body);
    const shift = await prisma.shift.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!shift) return reply.code(404).send({ error: "Schicht nicht gefunden" });
    return prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: { id },
        data: {
          ...(body.fromTime ? { fromTime: body.fromTime } : {}),
          ...(body.toTime ? { toTime: body.toTime } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        },
      });
      if (body.employeeIds) {
        const found = await prisma.employee.count({
          where: { id: { in: body.employeeIds }, hotelId: req.user!.hotelId!, deletedAt: null },
        });
        if (found !== body.employeeIds.length) {
          return reply.code(400).send({ error: "Mitarbeiter gehören nicht zum Hotel" });
        }
        await tx.shiftAssignment.deleteMany({ where: { shiftId: id } });
        await tx.shiftAssignment.createMany({ data: body.employeeIds.map((employeeId) => ({ shiftId: id, employeeId })) });
      }
      return tx.shift.findFirstOrThrow({ where: { id }, include: { assignments: { include: { employee: { select: { id: true, name: true } } } } } });
    });
  });

  app.delete("/shifts/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    await prisma.$transaction([
      prisma.shiftAssignment.deleteMany({ where: { shiftId: id } }),
      prisma.shift.updateMany({ where: { id, hotelId: req.user!.hotelId! }, data: { deletedAt: new Date() } }),
    ]);
    return reply.send({ ok: true });
  });

  // ── Urlaub ─────────────────────────────────────────────────
  app.get("/vacations", async (req) => {
    const { year } = z.object({ year: z.string().regex(/^\d{4}$/) }).parse(req.query);
    return prisma.vacationRequest.findMany({
      where: {
        hotelId: req.user!.hotelId!,
        deletedAt: null,
        dateFrom: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lte: new Date(`${year}-12-31T23:59:59.999Z`) },
      },
      include: { employee: { select: { id: true, name: true, department: true, vacationQuotaDays: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

  /** Jahresübersicht: Kontingent, genehmigt, offen je Mitarbeiter + Monatsspalten. */
  app.get("/vacations/overview", async (req) => {
    const { year } = z.object({ year: z.string().regex(/^\d{4}$/) }).parse(req.query);
    const hotelId = req.user!.hotelId!;
    const [employees, requests] = await Promise.all([
      prisma.employee.findMany({ where: { hotelId, deletedAt: null, active: true }, orderBy: { name: "asc" } }),
      prisma.vacationRequest.findMany({
        where: {
          hotelId,
          deletedAt: null,
          status: { in: ["PENDING", "APPROVED"] },
          dateFrom: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lte: new Date(`${year}-12-31T23:59:59.999Z`) },
        },
      }),
    ]);
    return employees.map((e) => {
      const own = requests.filter((r) => r.employeeId === e.id);
      const approved = own.filter((r) => r.status === "APPROVED");
      const pending = own.filter((r) => r.status === "PENDING");
      const months: number[] = Array.from({ length: 12 }, () => 0);
      for (const r of approved) {
        // Urlaubstage grob auf Monate verteilen (Startmonat bekommt die Tage im Monat)
        let cursor = dateToIso(r.dateFrom);
        while (cursor <= dateToIso(r.dateTo)) {
          const month = Number(cursor.slice(5, 7)) - 1;
          const monthEnd = new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 0)).toISOString().slice(0, 10);
          const daysInMonth = inclusiveDays(cursor, monthEnd > r.dateTo.toISOString().slice(0, 10) ? dateToIso(r.dateTo) : monthEnd);
          months[month] += daysInMonth;
          cursor = monthEnd;
          const next = new Date(new Date(`${monthEnd}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10);
          cursor = next;
          if (next > dateToIso(r.dateTo)) break;
        }
      }
      return {
        employeeId: e.id,
        name: e.name,
        department: e.department,
        quota: e.vacationQuotaDays,
        approvedDays: approved.reduce((s, r) => s + r.days, 0),
        pendingDays: pending.reduce((s, r) => s + r.days, 0),
        months,
      };
    });
  });

  app.post("/vacations", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const body = z
      .object({
        employeeId: z.string(),
        dateFrom: z.string().regex(DATE_RE),
        dateTo: z.string().regex(DATE_RE),
        note: z.string().optional(),
      })
      .parse(req.body);
    if (body.dateFrom > body.dateTo) {
      return reply.code(400).send({ error: "Ende muss nach Beginn liegen" });
    }
    const employee = await prisma.employee.findFirst({
      where: { id: body.employeeId, hotelId: req.user!.hotelId!, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return reply.code(400).send({ error: "Mitarbeiter nicht gefunden" });
    const request = await prisma.vacationRequest.create({
      data: {
        hotelId: req.user!.hotelId!,
        employeeId: body.employeeId,
        dateFrom: isoToDate(body.dateFrom),
        dateTo: isoToDate(body.dateTo),
        days: inclusiveDays(body.dateFrom, body.dateTo),
        note: body.note,
      },
      include: { employee: { select: { id: true, name: true } } },
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "VacationRequest", entityId: request.id, action: "CREATE", after: { employeeId: body.employeeId, days: request.days } });
    return reply.code(201).send(request);
  });

  app.patch("/vacations/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]) }).parse(req.body);
    const request = await prisma.vacationRequest.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!request) return reply.code(404).send({ error: "Antrag nicht gefunden" });
    const updated = await prisma.vacationRequest.update({
      where: { id },
      data: { status: body.status, approverId: req.user!.id, decidedAt: new Date() },
      include: { employee: { select: { id: true, name: true } } },
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "VacationRequest", entityId: id, action: `STATUS_${body.status}`, before: { status: request.status }, after: { status: body.status } });
    return reply.send(updated);
  });

  app.delete("/vacations/:id", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    await prisma.vacationRequest.updateMany({ where: { id, hotelId: req.user!.hotelId! }, data: { deletedAt: new Date() } });
    return reply.send({ ok: true });
  });
}
