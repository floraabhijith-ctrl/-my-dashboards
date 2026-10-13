import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { sessions, users, userProperties, type User, type UserRole } from "../db/schema";
import { newToken, newId } from "../ids";
import { nowIso } from "../dates";

export const SESSION_COOKIE = "flora_session";
const SESSION_TTL_HOURS = 12;

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  managerId: string | null;
  approvalLimitBps: number;
  mustChangePassword: boolean;
  propertyIds: string[];
  /** For managers: ids of users whose managerId === this user (direct team). */
  teamMemberIds: string[];
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(user: User, meta: { ip?: string | null; userAgent?: string | null }) {
  const db = getDb();
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId: user.id,
    expiresAt,
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  // Opportunistic cleanup of expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, nowIso()));
  return { token, expiresAt };
}

export async function destroySessionByToken(token: string) {
  await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function destroyAllSessionsForUser(userId: string) {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export async function loadUserContext(userId: string): Promise<CurrentUser | null> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.isActive, true)) });
  if (!user) return null;
  const props = await db.select({ propertyId: userProperties.propertyId }).from(userProperties).where(eq(userProperties.userId, user.id));
  const team =
    user.role === "SALES_MANAGER"
      ? await db.select({ id: users.id }).from(users).where(and(eq(users.managerId, user.id), eq(users.isActive, true)))
      : [];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    managerId: user.managerId,
    approvalLimitBps: user.approvalLimitBps,
    mustChangePassword: user.mustChangePassword,
    propertyIds: props.map((p) => p.propertyId),
    teamMemberIds: team.map((t) => t.id),
  };
}

/** Resolve the current user from a raw session token (used by API routes and tests). */
export async function resolveUserFromToken(token: string | null | undefined): Promise<CurrentUser | null> {
  if (!token) return null;
  const db = getDb();
  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, nowIso())),
  });
  if (!row) return null;
  const user = await loadUserContext(row.userId);
  if (!user) return null;
  // Touch last seen (best effort, throttled to once per minute).
  if (Date.now() - new Date(row.lastSeenAt).getTime() > 60_000) {
    await db.update(sessions).set({ lastSeenAt: nowIso() }).where(eq(sessions.id, row.id));
  }
  return user;
}

export function tokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}

/** Current user for server components (reads the cookie store). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  return resolveUserFromToken(store.get(SESSION_COOKIE)?.value);
}

/** Current user for route handlers (reads the request cookie header). */
export async function getUserFromRequest(req: Request): Promise<CurrentUser | null> {
  return resolveUserFromToken(tokenFromRequest(req));
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}

export const sessionCookieOptions = (expiresAt: string) => ({
  name: SESSION_COOKIE,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires: new Date(expiresAt),
});

export const newAuditId = newId;
