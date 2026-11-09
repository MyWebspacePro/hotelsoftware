import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { authRoutes } from "./modules/auth.routes.js";
import { usersRoutes } from "./modules/users.routes.js";
import { hotelRoutes } from "./modules/hotels.routes.js";

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

  return app;
}
