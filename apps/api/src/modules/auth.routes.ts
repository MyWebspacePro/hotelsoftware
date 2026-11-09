import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenUser,
} from "../lib/auth.js";
import { safeSnapshot, writeAudit } from "../lib/audit.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Login-Rate-Limit (In-Memory): nach 10 Fehlversuchen pro IP+E-Mail 15 Minuten Sperre.
 * Schützt das öffentliche System gegen Passwort-Raten.
 */
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_FAILED_ATTEMPTS = 10;
const BLOCK_MS = 15 * 60 * 1000;

function clientKey(req: { ip?: string; body?: unknown }): string {
  const email = ((req.body as { email?: string })?.email ?? "").toLowerCase();
  return `${req.ip ?? "unknown"}|${email}`;
}

function checkRateLimit(key: string): boolean {
  const entry = loginAttempts.get(key);
  if (!entry) return true;
  if (entry.blockedUntil > Date.now()) return false;
  if (entry.blockedUntil !== 0 && entry.blockedUntil <= Date.now()) loginAttempts.delete(key);
  return true;
}

function recordFailedLogin(key: string): void {
  const entry = loginAttempts.get(key) ?? { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

function clearFailedLogins(key: string): void {
  loginAttempts.delete(key);
}

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, "Neues Passwort: mindestens 8 Zeichen"),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

function toTokenUser(user: { id: string; email: string; role: string; hotelId: string | null }): TokenUser {
  return { id: user.id, email: user.email, role: user.role, hotelId: user.hotelId };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (req, reply) => {
    const key = clientKey(req);
    if (!checkRateLimit(key)) {
      return reply.code(429).send({ error: "Zu viele Fehlversuche — bitte in 15 Minuten erneut versuchen" });
    }
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { email: body.email, deletedAt: null },
    });
    if (!user || !user.active) {
      recordFailedLogin(key);
      return reply.code(401).send({ error: "E-Mail oder Passwort falsch" });
    }
    const passwordOk = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordOk) {
      recordFailedLogin(key);
      return reply.code(401).send({ error: "E-Mail oder Passwort falsch" });
    }
    clearFailedLogins(key);

    const tokenUser = toTokenUser(user);
    const accessToken = signAccessToken(tokenUser);
    const refreshToken = signRefreshToken(tokenUser);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAudit({
      hotelId: user.hotelId,
      userId: user.id,
      entity: "User",
      entityId: user.id,
      action: "LOGIN",
    });

    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
    });
  });

  app.post("/refresh", async (req, reply) => {
    const body = refreshSchema.parse(req.body);
    let userId: string;
    try {
      ({ id: userId } = verifyRefreshToken(body.refreshToken));
    } catch {
      return reply.code(401).send({ error: "Refresh-Token ungültig" });
    }
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user || !user.active) {
      return reply.code(401).send({ error: "Benutzer inaktiv" });
    }
    const tokenUser = toTokenUser(user);
    return reply.send({
      accessToken: signAccessToken(tokenUser),
      refreshToken: signRefreshToken(tokenUser),
    });
  });

  app.get("/me", { preHandler: authenticate }, async (req) => {
    const user = await prisma.user.findFirstOrThrow({
      where: { id: req.user!.id, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        hotelId: true,
        hotel: { select: { id: true, name: true, country: true, currency: true } },
      },
    });
    return { user };
  });

  app.post("/change-password", { preHandler: authenticate }, async (req, reply) => {
    const body = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findFirstOrThrow({ where: { id: req.user!.id } });
    const ok = await bcrypt.compare(body.oldPassword, user.passwordHash);
    if (!ok) {
      return reply.code(400).send({ error: "Altes Passwort ist falsch" });
    }
    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await writeAudit({
      hotelId: user.hotelId,
      userId: user.id,
      entity: "User",
      entityId: user.id,
      action: "CHANGE_PASSWORD",
    });
    return reply.send({ ok: true });
  });
}
