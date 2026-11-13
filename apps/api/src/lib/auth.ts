import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface TokenUser {
  id: string;
  email: string;
  role: string;
  hotelId: string | null;
}

export interface AccessTokenPayload extends TokenUser {
  type: "access";
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenPayload;
  }
}

const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

export function signAccessToken(user: TokenUser): string {
  return jwt.sign({ ...user, type: "access" }, env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(user: TokenUser): string {
  return jwt.sign({ id: user.id, type: "refresh" }, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as Partial<AccessTokenPayload>;
  if (payload.type !== "access") throw new Error("Falscher Token-Typ");
  return payload as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { id: string } {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { id: string; type?: string };
  if (payload.type !== "refresh") throw new Error("Falscher Token-Typ");
  return { id: payload.id };
}

/** preHandler: setzt req.user oder antwortet 401. (async — Fastify 5 erwartet awaitbare Hooks) */
export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    await reply.code(401).send({ error: "Nicht eingeloggt" });
    return;
  }
  try {
    req.user = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    await reply.code(401).send({ error: "Sitzung abgelaufen — bitte neu einloggen" });
  }
}

/** preHandler-Fabrik: verlangt eine der Rollen. (async — siehe authenticate) */
export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      await reply.code(401).send({ error: "Nicht eingeloggt" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      await reply.code(403).send({ error: "Keine Berechtigung" });
    }
  };
}