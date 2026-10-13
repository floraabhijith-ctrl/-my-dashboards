import { desc, eq, and } from "drizzle-orm";
import { handle, json, requireUser } from "@/lib/http";
import { AuthzError } from "@/lib/authz";
import { getDb } from "@/lib/db/client";
import { auditLogs, users } from "@/lib/db/schema";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new AuthzError();
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const rows = await getDb()
    .select({ a: auditLogs, userName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(entityType && entityId ? and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);
  return json({ audit: rows.map((r) => ({ ...r.a, userName: r.userName })) });
});
