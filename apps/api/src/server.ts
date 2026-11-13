import { buildApp } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import { runRetentionForHotel } from "./lib/retention.js";

const app = await buildApp();

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

/** Täglicher DSGVO-Löschlauf (04:05 UTC) für alle Hotels. */
async function retentionTick(): Promise<void> {
  const hotels = await prisma.hotel.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const hotel of hotels) {
    try {
      const result = await runRetentionForHotel(hotel.id, null);
      if (result.registrationsAnonymized || result.guestsAnonymized) {
        app.log.info({ hotelId: hotel.id, ...result }, "Retention-Lauf");
      }
    } catch (err) {
      app.log.error({ err, hotelId: hotel.id }, "Retention-Lauf fehlgeschlagen");
    }
  }
}

const retentionTimer = setInterval(() => {
  void retentionTick().catch((err) => app.log.error({ err }, "Retention-Timer fehlgeschlagen"));
}, 24 * 60 * 60 * 1000);
retentionTimer.unref?.();

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Signal ${signal} — fahre herunter`);
  clearInterval(retentionTimer);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

// Einmalig beim Start prüfen (lokal/VPS), damit ein versäumter Tag nachgeholt wird.
void retentionTick().catch((err) => app.log.error({ err }, "Retention-Startlauf fehlgeschlagen"));