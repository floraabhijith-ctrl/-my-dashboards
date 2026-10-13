import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { json } from "@/lib/http";

export async function GET() {
  try {
    await getDb().run(sql`select 1`);
    return json({ ok: true, time: new Date().toISOString() });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
