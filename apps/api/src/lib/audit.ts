import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export interface AuditParams {
  hotelId?: string | null;
  userId?: string | null;
  entity: string;
  entityId?: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export async function writeAudit(params: AuditParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      hotelId: params.hotelId ?? undefined,
      userId: params.userId ?? undefined,
      entity: params.entity,
      entityId: params.entityId ?? undefined,
      action: params.action,
      before: params.before ? (params.before as Prisma.InputJsonValue) : undefined,
      after: params.after ? (params.after as Prisma.InputJsonValue) : undefined,
    },
  });
}

/** Stripped sensible Felder vor Audit-Eintrag. */
export function safeSnapshot<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const { passwordHash: _pw, ...rest } = obj as Record<string, unknown>;
  return rest;
}
