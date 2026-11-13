import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { env } from "./env.js";
import { authRoutes } from "./modules/auth.routes.js";
import { usersRoutes } from "./modules/users.routes.js";
import { hotelRoutes } from "./modules/hotels.routes.js";
import { roomsRoutes } from "./modules/rooms.routes.js";
import { pricingRoutes } from "./modules/pricing.routes.js";
import { articlesRoutes } from "./modules/articles.routes.js";
import { guestsRoutes } from "./modules/guests.routes.js";
import { bookingsRoutes } from "./modules/bookings.routes.js";
import { calendarRoutes } from "./modules/calendar.routes.js";
import { foliosRoutes } from "./modules/folios.routes.js";
import { invoicesRoutes } from "./modules/invoices.routes.js";
import { closingRoutes } from "./modules/closing.routes.js";
import { fibuRoutes } from "./modules/fibu.routes.js";
import { registrationsRoutes } from "./modules/registrations.routes.js";
import { retentionRoutes } from "./modules/retention.routes.js";
import { housekeepingRoutes } from "./modules/housekeeping.routes.js";
import { staffRoutes } from "./modules/staff.routes.js";
import { channelsRoutes } from "./modules/channels.routes.js";
import { publicRoutes } from "./modules/public.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    // Hinter Traefik: echte Client-IP für Rate-Limiting/Logs
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_000_000,
  });

  const origins = env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    await app.register(cors, { origin: origins, credentials: true });
  }

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "Validierung fehlgeschlagen",
        details: err.flatten().fieldErrors,
      });
    }
    // Fastify-eigene Validierung (z. B. JSON-Body) hat err.validation
    const validation = (err as { validation?: unknown }).validation;
    if (validation) {
      return reply.code(400).send({ error: "Validierung fehlgeschlagen", details: validation });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err }, "Unerwarteter Fehler");
      // Keine internen Details an den Client
      return reply.code(500).send({ error: "Interner Fehler" });
    }
    return reply.code(status).send({ error: (err as Error).message });
  });

  app.get("/api/health", async () => ({ ok: true, service: "hotelguru-api" }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(usersRoutes, { prefix: "/api/users" });
  await app.register(hotelRoutes, { prefix: "/api/hotel" });
  await app.register(roomsRoutes, { prefix: "/api/rooms" });
  await app.register(pricingRoutes, { prefix: "/api/pricing" });
  await app.register(articlesRoutes, { prefix: "/api/articles" });
  await app.register(guestsRoutes, { prefix: "/api/guests" });
  await app.register(bookingsRoutes, { prefix: "/api/bookings" });
  await app.register(calendarRoutes, { prefix: "/api/calendar" });
  await app.register(foliosRoutes, { prefix: "/api/folios" });
  await app.register(invoicesRoutes, { prefix: "/api/invoices" });
  await app.register(closingRoutes, { prefix: "/api/closing" });
  await app.register(fibuRoutes, { prefix: "/api/fibu" });
  await app.register(registrationsRoutes, { prefix: "/api/registrations" });
  await app.register(retentionRoutes, { prefix: "/api/retention" });
  await app.register(housekeepingRoutes, { prefix: "/api/housekeeping" });
  await app.register(staffRoutes, { prefix: "/api/staff" });
  await app.register(channelsRoutes, { prefix: "/api/channels" });
  await app.register(publicRoutes, { prefix: "/api/public" });

  return app;
}