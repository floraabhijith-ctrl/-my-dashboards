import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { syncOutbox } from "../db/schema";
import { nowIso } from "../dates";
import { googleSheetsWrite, googleSheetsHealth } from "./google-sheets";
import { microsoftListsWrite, microsoftListsHealth } from "./microsoft-lists";
import type { SyncEntity } from "./outbox";

const MAX_ATTEMPTS = 8;

export function activeProvider() {
  return (process.env.SYNC_PROVIDER ?? "none") as "none" | "google-sheets" | "microsoft-lists";
}

/** Drains pending outbox rows in order. Safe to call concurrently (rows are claimed by status). */
export async function processOutbox(limit = 50): Promise<{ processed: number; failed: number; provider: string }> {
  const provider = activeProvider();
  if (provider === "none") return { processed: 0, failed: 0, provider };
  const db = getDb();
  const pending = await db
    .select()
    .from(syncOutbox)
    .where(inArray(syncOutbox.status, ["PENDING", "FAILED"]))
    .orderBy(asc(syncOutbox.createdAt))
    .limit(limit);
  let processed = 0;
  let failed = 0;
  for (const row of pending) {
    if (row.attempts >= MAX_ATTEMPTS) continue;
    const claim = await db.update(syncOutbox).set({ status: "PROCESSING", attempts: sql`${syncOutbox.attempts} + 1` }).where(eq(syncOutbox.id, row.id));
    if (claim.rowsAffected === 0) continue;
    try {
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      if (provider === "google-sheets") await googleSheetsWrite(row.entityType as SyncEntity, row.operation, payload);
      else await microsoftListsWrite(row.entityType as SyncEntity, row.operation, payload);
      await db.update(syncOutbox).set({ status: "DONE", processedAt: nowIso(), lastError: null, provider }).where(eq(syncOutbox.id, row.id));
      processed++;
    } catch (err) {
      failed++;
      await db.update(syncOutbox).set({ status: "FAILED", lastError: err instanceof Error ? err.message.slice(0, 1000) : String(err), provider }).where(eq(syncOutbox.id, row.id));
    }
  }
  return { processed, failed, provider };
}

export async function syncStatus() {
  const db = getDb();
  const provider = activeProvider();
  const rows = await db.select({ status: syncOutbox.status, n: sql<number>`count(*)` }).from(syncOutbox).groupBy(syncOutbox.status);
  const lastError = await db.select({ lastError: syncOutbox.lastError, createdAt: syncOutbox.createdAt }).from(syncOutbox).where(eq(syncOutbox.status, "FAILED")).orderBy(asc(syncOutbox.createdAt)).limit(1);
  const health = provider === "google-sheets" ? await googleSheetsHealth() : provider === "microsoft-lists" ? await microsoftListsHealth() : { ok: true, detail: "No external mirror configured (database is the source of truth)." };
  return {
    provider,
    counts: Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])),
    lastError: lastError[0] ?? null,
    health,
  };
}
