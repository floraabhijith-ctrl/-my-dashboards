import { after } from "next/server";
import { processOutbox } from "./processor";

/**
 * Drain the sync outbox once the current response has been sent. Falls back to a
 * fire-and-forget call when no request scope exists (scripts, tests).
 */
export function scheduleSync() {
  if ((process.env.SYNC_PROVIDER ?? "none") === "none") return;
  const run = () => processOutbox().catch((e) => console.error("[sync]", e));
  try {
    after(run);
  } catch {
    void run();
  }
}
