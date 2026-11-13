import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { runRetentionForHotel } from "../lib/retention.js";

export async function retentionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  /** Verlauf der Löschläufe. */
  app.get("/runs", async (req) => {
    return prisma.retentionRun.findMany({
      where: { hotelId: req.user!.hotelId! },
      orderBy: { executedAt: "desc" },
      take: 50,
    });
  });

  /** DSGVO-Löschlauf (manuell; täglich zusätzlich automatisch, siehe server.ts). */
  app.post("/run", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req) => {
    const hotelId = req.user!.hotelId!;
    const result = await runRetentionForHotel(hotelId, req.user!.id);
    await writeAudit({
      hotelId,
      userId: req.user!.id,
      entity: "RetentionRun",
      action: "RUN",
      after: { registrations: result.registrationsAnonymized, guests: result.guestsAnonymized },
    });
    return result;
  });
}