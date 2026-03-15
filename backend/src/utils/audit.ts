/**
 * audit.ts
 * Fire-and-forget audit logging helper.
 * Never throws — audit failures must not block responses.
 */

import prisma from '../config/prisma';

export interface AuditEntry {
  actorId: string;
  actorName?: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  storeId?: string | null;
  storeName?: string | null;
}

export function audit(entry: AuditEntry): void {
  prisma.auditLog.create({
    data: {
      actorId:   entry.actorId,
      actorName: entry.actorName || null,
      actorRole: entry.actorRole,
      action:    entry.action,
      entity:    entry.entity,
      entityId:  entry.entityId || null,
      details:   entry.details ? JSON.stringify(entry.details) : null,
      storeId:   entry.storeId || null,
      storeName: entry.storeName || null,
    },
  }).catch((err) => {
    console.error(`[audit] Failed to write log (${entry.action}):`, err.message);
  });
}
