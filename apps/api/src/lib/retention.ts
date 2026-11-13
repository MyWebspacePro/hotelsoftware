import { prisma } from "./prisma.js";
import { anonymizedGuestFields, anonymizedRegistrationFields, shouldAnonymizeGuest, todayIso } from "@hg/shared";

const GUEST_PROFILE_DAYS_DEFAULT = 1095; // 3 Jahre ohne Aktivität

export interface RetentionResult {
  registrationsAnonymized: number;
  guestsAnonymized: number;
  guestProfileDays: number;
}

/**
 * DSGVO-Löschlauf für ein Hotel:
 * 1. Meldescheine mit abgelaufener Frist → Personenbezug entfernen
 * 2. Gästeprofile ohne Aktivität über konfigurierbarem Zeitraum → anonymisieren
 *    ( Gäste ohne Aufenthalt werden ab Erstellung des Profils gewertet )
 */
export async function runRetentionForHotel(hotelId: string, executedById: string | null): Promise<RetentionResult> {
  const today = todayIso();

  const config = await prisma.systemConfig.findUnique({ where: { hotelId } });
  const guestProfileDays =
    (config?.config as { retention?: { guestProfileDays?: number } } | null)?.retention?.guestProfileDays ??
    GUEST_PROFILE_DAYS_DEFAULT;

  // 1) Meldescheine
  const expired = await prisma.registrationRecord.findMany({
    where: { hotelId, anonymizedAt: null, retentionUntil: { lt: new Date(`${today}T00:00:00.000Z`) } },
    select: { id: true },
  });
  for (const record of expired) {
    await prisma.registrationRecord.update({
      where: { id: record.id },
      data: { ...anonymizedRegistrationFields(), anonymizedAt: new Date() },
    });
  }

  // 2) Gästeprofile
  const guests = await prisma.guest.findMany({
    where: { hotelId, deletedAt: null, firstName: { not: "Anonymisiert" } },
    select: { id: true, createdAt: true },
  });
  let guestsAnonymized = 0;
  for (const guest of guests) {
    const stays = await prisma.reservation.findMany({
      where: { booking: { guestId: guest.id, hotelId, deletedAt: null }, deletedAt: null },
      select: { dateTo: true, status: true },
    });
    const activeOrFuture = stays.some(
      (s) => new Date(s.dateTo).toISOString().slice(0, 10) >= today && s.status !== "CANCELLED" && s.status !== "NO_SHOW",
    );
    const lastDeparture = stays.map((s) => new Date(s.dateTo).toISOString().slice(0, 10)).sort().slice(-1)[0] ?? null;
    if (
      shouldAnonymizeGuest({
        lastDeparture,
        hasActiveOrFutureStay: activeOrFuture,
        retentionDays: guestProfileDays,
        todayIso: today,
        createdIso: guest.createdAt.toISOString().slice(0, 10),
      })
    ) {
      await prisma.guest.update({ where: { id: guest.id }, data: anonymizedGuestFields() });
      guestsAnonymized += 1;
    }
  }

await prisma.retentionRun.create({
      data: {
        hotelId,
        executedById: executedById ?? undefined,
        registrationsAnonymized: expired.length,
        guestsAnonymized,
        details: { today, guestProfileDays } as never,
      },
    });

  return { registrationsAnonymized: expired.length, guestsAnonymized, guestProfileDays };
}