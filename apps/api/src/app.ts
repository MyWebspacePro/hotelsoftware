import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
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

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "Validierung fehlgeschlagen",
        details: err.flatten().fieldErrors,
      });
    }
    if (err instanceof Error) {
      app.log.error(err);
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.code(status).send({ error: err.message });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "Interner Fehler" });
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

  return app;
}
