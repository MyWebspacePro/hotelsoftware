import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dateToIso = (d: Date) => d.toISOString().slice(0, 10);

export async function housekeepingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  /**
   * Board eines Tages: alle aktiven Zimmer mit Status, Tasks, Zuweisung und
   * Belegungskontext (Abreise heute / bleibt / Anreise heute).
   */
  app.get("/board", async (req) => {
    const { date } = z.object({ date: z.string().regex(DATE_RE) }).parse(req.query);
    const hotelId = req.user!.hotelId!;
    const d = isoToDate(date);
    const nextDay = new Date(d.getTime() + 86400000);

    const [rooms, statuses, tasks, employees, departures, arrivals, stayovers] = await Promise.all([
      prisma.room.findMany({
        where: { hotelId, deletedAt: null },
        include: { roomType: { select: { id: true, name: true, color: true } } },
        orderBy: { number: "asc" },
      }),
      prisma.roomStatus.findMany({ where: { hotelId, date: d } }),
      prisma.housekeepingTask.findMany({
        where: { hotelId, date: d, deletedAt: null },
        include: { assignee: { select: { id: true, name: true } } },
      }),
      prisma.employee.findMany({ where: { hotelId, deletedAt: null, active: true, department: "HOUSEKEEPING" }, select: { id: true, name: true } }),
      prisma.reservation.findMany({ where: { hotelId, deletedAt: null, status: { in: ["CHECKED_IN", "CHECKED_OUT", "CONFIRMED"] }, dateTo: d }, select: { roomId: true } }),
      prisma.reservation.findMany({ where: { hotelId, deletedAt: null, status: { in: ["CONFIRMED", "OFFERED", "CHECKED_IN"] }, dateFrom: d }, select: { roomId: true } }),
      prisma.reservation.findMany({ where: { hotelId, deletedAt: null, status: { in: ["CHECKED_IN", "CONFIRMED"] }, dateFrom: { lt: d }, dateTo: { gt: nextDay } }, select: { roomId: true } }),
    ]);

    const departureSet = new Set(departures.map((r) => r.roomId).filter(Boolean));
    const arrivalSet = new Set(arrivals.map((r) => r.roomId).filter(Boolean));
    const stayoverSet = new Set(stayovers.map((r) => r.roomId).filter(Boolean));

    return {
      date,
      employees,
      rooms: rooms.map((room) => {
        const status = statuses.find((s) => s.roomId === room.id);
        const task = tasks.find((t) => t.roomId === room.id);
        return {
          roomId: room.id,
          number: room.number,
          roomTypeName: room.roomType.name,
          color: room.roomType.color,
          cleanStatus: status?.cleanStatus ?? "CLEAN",
          dnd: status?.dnd ?? false,
          notes: status?.notes ?? null,
          occupancy: departureSet.has(room.id) ? "DEPARTURE" : arrivalSet.has(room.id) ? "ARRIVAL" : stayoverSet.has(room.id) ? "STAYOVER" : "VACANT",
          task: task
            ? { id: task.id, type: task.type, status: task.status, assigneeId: task.assigneeId, assigneeName: task.assignee?.name ?? null, notes: task.notes }
            : null,
        };
      }),
    };
  });

  /** Status eines Zimmers an einem Tag setzen (Upsert). */
  app.patch("/status/:roomId", async (req, reply) => {
    const roomId = (req.params as { roomId: string }).roomId;
    const body = z
      .object({
        date: z.string().regex(DATE_RE),
        cleanStatus: z.enum(["CLEAN", "DIRTY", "INSPECTED", "BLOCKED"]).optional(),
        dnd: z.boolean().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const hotelId = req.user!.hotelId!;
    const data = {
      ...(body.cleanStatus ? { cleanStatus: body.cleanStatus } : {}),
      ...(body.dnd !== undefined ? { dnd: body.dnd } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    };
    const status = await prisma.roomStatus.upsert({
      where: { roomId_date: { roomId, date: isoToDate(body.date) } },
      update: data,
      create: { hotelId, roomId, date: isoToDate(body.date), cleanStatus: body.cleanStatus ?? "DIRTY", dnd: body.dnd ?? false, notes: body.notes },
    });
    return reply.send(status);
  });

  /** Tasks für einen Tag automatisch erzeugen (Abreise → CHECKOUT, Bleibt → STAYOVER). */
  app.post("/generate", async (req, reply) => {
    const body = z.object({ date: z.string().regex(DATE_RE) }).parse(req.body);
    const hotelId = req.user!.hotelId!;
    const d = isoToDate(body.date);
    const nextDay = new Date(d.getTime() + 86400000);

    const [departures, stayovers, existingTasks] = await Promise.all([
      prisma.reservation.findMany({ where: { hotelId, deletedAt: null, status: { in: ["CHECKED_IN", "CONFIRMED"] }, dateTo: d }, select: { roomId: true } }),
      prisma.reservation.findMany({ where: { hotelId, deletedAt: null, status: { in: ["CHECKED_IN", "CONFIRMED"] }, dateFrom: { lt: d }, dateTo: { gt: nextDay } }, select: { roomId: true } }),
      prisma.housekeepingTask.findMany({ where: { hotelId, date: d, deletedAt: null }, select: { roomId: true, type: true } }),
    ]);

    const wanted: Array<{ roomId: string; type: "CHECKOUT" | "STAYOVER" }> = [];
    for (const r of departures) {
      if (r.roomId) wanted.push({ roomId: r.roomId, type: "CHECKOUT" });
    }
    for (const r of stayovers) {
      if (r.roomId) wanted.push({ roomId: r.roomId, type: "STAYOVER" });
    }

    let created = 0;
    for (const w of wanted) {
      const exists = existingTasks.some((t) => t.roomId === w.roomId && (w.type === "CHECKOUT" ? t.type === "CHECKOUT" : t.type === "STAYOVER" || t.type === "CHECKOUT"));
      if (!exists) {
        await prisma.housekeepingTask.create({ data: { hotelId, roomId: w.roomId, date: d, type: w.type } });
        created += 1;
      }
    }
    return reply.send({ created, generatedFor: body.date, checkout: departures.length, stayover: stayovers.length });
  });

  app.post("/tasks", async (req, reply) => {
    const body = z
      .object({
        roomId: z.string(),
        date: z.string().regex(DATE_RE),
        type: z.enum(["CHECKOUT", "STAYOVER", "DEEP", "LAUNDRY"]),
        notes: z.string().optional(),
        assigneeId: z.string().optional(),
      })
      .parse(req.body);
    const task = await prisma.housekeepingTask.create({
      data: {
        hotelId: req.user!.hotelId!,
        roomId: body.roomId,
        date: isoToDate(body.date),
        type: body.type,
        notes: body.notes,
        assigneeId: body.assigneeId,
      },
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "HousekeepingTask", entityId: task.id, action: "CREATE", after: { type: body.type, date: body.date } });
    return reply.code(201).send(task);
  });

  app.patch("/tasks/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z
      .object({
        status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "SKIPPED"]).optional(),
        assigneeId: z.string().optional().or(z.literal("")),
        notes: z.string().optional(),
        type: z.enum(["CHECKOUT", "STAYOVER", "DEEP", "LAUNDRY"]).optional(),
      })
      .parse(req.body);
    const task = await prisma.housekeepingTask.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!task) return reply.code(404).send({ error: "Task nicht gefunden" });
    const updated = await prisma.housekeepingTask.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.type ? { type: body.type } : {}),
      },
    });
    return reply.send(updated);
  });

  app.delete("/tasks/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    await prisma.housekeepingTask.updateMany({ where: { id, hotelId: req.user!.hotelId! }, data: { deletedAt: new Date() } });
    return reply.send({ ok: true });
  });

  // ── Technik-Tickets ────────────────────────────────────────
  app.get("/tickets", async (req) => {
    const { status } = req.query as { status?: string };
    return prisma.maintenanceTicket.findMany({
      where: {
        hotelId: req.user!.hotelId!,
        deletedAt: null,
        ...(status ? { status: status as never } : {}),
      },
      include: { room: { select: { number: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  app.post("/tickets", async (req, reply) => {
    const body = z
      .object({
        roomId: z.string().optional(),
        area: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
      })
      .parse(req.body);
    const ticket = await prisma.maintenanceTicket.create({
      data: {
        hotelId: req.user!.hotelId!,
        roomId: body.roomId,
        area: body.area,
        title: body.title,
        description: body.description,
        priority: body.priority,
        createdById: req.user!.id,
      },
    });
    await writeAudit({ hotelId: req.user!.hotelId, userId: req.user!.id, entity: "MaintenanceTicket", entityId: ticket.id, action: "CREATE", after: { title: body.title, priority: body.priority } });
    return reply.code(201).send(ticket);
  });

  app.patch("/tickets/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z
      .object({
        status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]).optional(),
        priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
        description: z.string().optional(),
      })
      .parse(req.body);
    const ticket = await prisma.maintenanceTicket.findFirst({ where: { id, hotelId: req.user!.hotelId!, deletedAt: null } });
    if (!ticket) return reply.code(404).send({ error: "Ticket nicht gefunden" });
    const updated = await prisma.maintenanceTicket.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status, ...(body.status === "DONE" ? { resolvedAt: new Date() } : {}) } : {}),
        ...(body.priority ? { priority: body.priority } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });
    return reply.send(updated);
  });
}
