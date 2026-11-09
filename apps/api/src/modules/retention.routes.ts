import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { anonymizedGuestFields, anonymizedRegistrationFields, shouldAnonymizeGuest } from "@hg/shared";

const dateToIso = (d: Date) => d.toISOString().slice(0, 10);

const GUEST_PROFILE_DAYS_DEFAULT = 1095; // 3 Jahre ohne Aktivität

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

  /**
   * DSGVO-Löschlauf (manuell, später per Cron):
   * 1. Meldescheine mit abgelaufener Frist → Personenbezug entfernen
   * 2. Gästeprofile ohne Aktivität über konfigurierbarer Frist → anonymisieren
   */
  app.post("/run", { preHandler: requireRole("ADMIN", "MANAGER") }, async (req) => {
    const hotelId = req.user!.hotelId!;
    const today = dateToIso(new Date());

    const config = await prisma.systemConfig.findUnique({ where: { hotelId } });
    const guestProfileDays =
      (config?.config as { retention?: { guestProfileDays?: number } })?.retention?.guestProfileDays ?? GUEST_PROFILE_DAYS_DEFAULT;

    // 1) Meldescheine
    const expired = await prisma.registrationRecord.findMany({
      where: { hotelId, anonymizedAt: null, retentionUntil: { lt: new Date(`${today}T00:00:00.000Z`) } },
    });
    for (const record of expired) {
      await prisma.registrationRecord.update({ where: { id: record.id }, data: { ...anonymizedRegistrationFields(), anonymizedAt: new Date() } });
    }

    // 2) Gästeprofile
    const guests = await prisma.guest.findMany({ where: { hotelId, deletedAt: null } });
    let guestsAnonymized = 0;
    for (const guest of guests) {
      const stays = await prisma.reservation.findMany({
        where: { booking: { guestId: guest.id, hotelId, deletedAt: null }, deletedAt: null },
        select: { dateTo: true, status: true },
      });
      if (stays.length === 0) continue;
      const activeOrFuture = stays.some((s) => dateToIso(s.dateTo) >= today && s.status !== "CANCELLED" && s.status !== "NO_SHOW");
      const lastDeparture = stays.map((s) => dateToIso(s.dateTo)).sort().slice(-1)[0];
      if (shouldAnonymizeGuest({ lastDeparture, hasActiveOrFutureStay: activeOrFuture, retentionDays: guestProfileDays, todayIso: today })) {
        await prisma.guest.update({ where: { id: guest.id }, data: anonymizedGuestFields(guest.id) });
        guestsAnonymized += 1;
      }
    }

    const run = await prisma.retentionRun.create({
      data: {
        hotelId,
        executedById: req.user!.id,
        registrationsAnonymized: expired.length,
        guestsAnonymized,
        details: { today, guestProfileDays } as never,
      },
    });
    await writeAudit({
      hotelId,
      userId: req.user!.id,
      entity: "RetentionRun",
      entityId: run.id,
      action: "RUN",
      after: { registrations: expired.length, guests: guestsAnonymized },
    });
    return run;
  });
}
