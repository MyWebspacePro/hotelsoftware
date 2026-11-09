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
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { email: body.email, deletedAt: null },
    });
    if (!user || !user.active) {
      return reply.code(401).send({ error: "E-Mail oder Passwort falsch" });
    }
    const passwordOk = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordOk) {
      return reply.code(401).send({ error: "E-Mail oder Passwort falsch" });
    }

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
