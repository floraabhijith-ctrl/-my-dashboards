import { getDb } from "./db/client";
import { auditLogs } from "./db/schema";
import { newId } from "./ids";

export async function writeAudit(entry: {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}) {
  await getDb()
    .insert(auditLogs)
    .values({
      id: newId(),
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
      ipAddress: entry.ip ?? null,
    });
}
