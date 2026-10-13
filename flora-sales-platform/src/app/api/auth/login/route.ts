import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { handle, json, readJson, clientIp, HttpError } from "@/lib/http";
import { writeAudit } from "@/lib/audit";
import { nowIso } from "@/lib/dates";
import { NextResponse } from "next/server";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

// Simple in-memory throttle per e-mail (per server instance) to slow brute force.
const attempts = new Map<string, { count: number; until: number }>();

export const POST = handle(async (req: Request) => {
  const { email, password } = schema.parse(await readJson(req));
  const now = Date.now();
  const a = attempts.get(email);
  if (a && a.count >= 8 && a.until > now) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");

  const user = await getDb().query.users.findFirst({ where: eq(users.email, email) });
  const ok = user && user.isActive && (await verifyPassword(password, user.passwordHash));
  if (!ok) {
    attempts.set(email, { count: (a?.count ?? 0) + 1, until: now + 10 * 60 * 1000 });
    await writeAudit({ userId: user?.id ?? null, action: "auth.login_failed", entityType: "user", entityId: email, ip: clientIp(req) });
    throw new HttpError(401, "Invalid e-mail or password");
  }
  attempts.delete(email);
  const { token, expiresAt } = await createSession(user, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  await getDb().update(users).set({ lastLoginAt: nowIso() }).where(eq(users.id, user.id));
  await writeAudit({ userId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ip: clientIp(req) });
  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword } });
  const opts = sessionCookieOptions(expiresAt);
  res.cookies.set(opts.name, token, opts);
  return res;
});
