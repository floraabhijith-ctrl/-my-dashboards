import { getDb } from "../db/client";
import { syncOutbox } from "../db/schema";
import { newId } from "../ids";

export type SyncEntity = "enquiry" | "activity" | "rate_revision";
export type SyncOperation = "upsert" | "append" | "delete";

/** Records a pending mirror write. Processing happens in processOutbox(). */
export async function enqueueSync(entityType: SyncEntity, entityId: string, operation: SyncOperation, payload: unknown) {
  if ((process.env.SYNC_PROVIDER ?? "none") === "none") return;
  await getDb().insert(syncOutbox).values({
    id: newId(),
    entityType,
    entityId,
    operation,
    payload: JSON.stringify(payload),
    provider: process.env.SYNC_PROVIDER,
  });
}
