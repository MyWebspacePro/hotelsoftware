import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL fehlt"),
  API_PORT: z.coerce.number().int().default(3001),
  JWT_SECRET: z.string().min(16, "JWT_SECRET zu kurz"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET zu kurz"),
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("info"),
  /** Kommagetrennte erlaubte CORS-Origins; leer = kein CORS (Same-Origin via nginx). */
  CORS_ORIGIN: z.string().default(""),
  /** Hinter Reverse-Proxy (Traefik): req.ip aus X-Forwarded-For */
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Umgebungsvariablen unvollständig:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;