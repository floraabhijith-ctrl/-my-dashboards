import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { users, userProperties, properties, USER_ROLES } from "../db/schema";
import { newId } from "../ids";
import { nowIso } from "../dates";
import { hashPassword, validatePasswordStrength } from "../auth/password";
import { destroyAllSessionsForUser, type CurrentUser } from "../auth/session";
import { writeAudit } from "../audit";
import { AuthzError, isManagement } from "../authz";
import { HttpError } from "../http";

export const userInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  role: z.enum(USER_ROLES),
  managerId: z.string().optional().nullable(),
  approvalLimitPct: z.coerce.number().min(0).max(100).default(0),
  propertyIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  notifyByEmail: z.boolean().default(true),
  password: z.string().optional(),
});
export type UserInput = z.infer<typeof userInputSchema>;

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: (typeof USER_ROLES)[number];
  managerId: string | null;
  managerName: string | null;
  approvalLimitBps: number;
  isActive: boolean;
  notifyByEmail: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  propertyIds: string[];
  createdAt: string;
}

export async function listUsers(actor: CurrentUser, opts: { includeInactive?: boolean } = {}): Promise<UserSummary[]> {
  if (!isManagement(actor)) throw new AuthzError();
  const db = getDb();
  const all = await db.select().from(users).orderBy(asc(users.name));
  const scoped =
    actor.role === "ADMIN"
      ? all
      : all.filter((u) => u.id === actor.id || actor.teamMemberIds.includes(u.id) || u.managerId === actor.id);
  const visible = opts.includeInactive ? scoped : scoped.filter((u) => u.isActive);
  const ids = visible.map((u) => u.id);
  const props = ids.length ? await db.select().from(userProperties).where(inArray(userProperties.userId, ids)) : [];
  const nameOf = new Map(all.map((u) => [u.id, u.name]));
  return visible.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    managerId: u.managerId,
    managerName: u.managerId ? (nameOf.get(u.managerId) ?? null) : null,
    approvalLimitBps: u.approvalLimitBps,
    isActive: u.isActive,
    notifyByEmail: u.notifyByEmail,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    propertyIds: props.filter((p) => p.userId === u.id).map((p) => p.propertyId),
    createdAt: u.createdAt,
  }));
}

/** Salespeople an actor may assign enquiries to (self, team or everyone for admins). */
export async function assignableUsers(actor: CurrentUser) {
  const db = getDb();
  const all = await db.select({ id: users.id, name: users.name, role: users.role, managerId: users.managerId }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name));
  if (actor.role === "ADMIN") return all;
  if (actor.role === "SALES_MANAGER") return all.filter((u) => u.id === actor.id || actor.teamMemberIds.includes(u.id));
  return all.filter((u) => u.id === actor.id);
}

export async function createUser(actor: CurrentUser, input: UserInput, meta: { ip?: string | null } = {}) {
  if (actor.role !== "ADMIN") throw new AuthzError();
  const db = getDb();
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) throw new HttpError(409, "A user with this e-mail already exists");
  const password = input.password ?? generateTempPassword();
  const weak = validatePasswordStrength(password);
  if (weak) throw new HttpError(422, weak);
  const id = newId();
  await db.insert(users).values({
    id,
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(password),
    role: input.role,
    managerId: input.role === "ADMIN" ? null : input.managerId || null,
    approvalLimitBps: Math.round(input.approvalLimitPct * 100),
    isActive: input.isActive,
    notifyByEmail: input.notifyByEmail,
    mustChangePassword: true,
  });
  await setUserProperties(id, input.propertyIds);
  await writeAudit({ userId: actor.id, action: "user.create", entityType: "user", entityId: id, after: { email: input.email, role: input.role }, ip: meta.ip });
  return { id, temporaryPassword: input.password ? undefined : password };
}

export async function updateUser(actor: CurrentUser, id: string, input: Partial<UserInput>, meta: { ip?: string | null } = {}) {
  if (actor.role !== "ADMIN") throw new AuthzError();
  const db = getDb();
  const before = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!before) throw new HttpError(404, "User not found");
  if (id === actor.id && input.role && input.role !== "ADMIN") throw new HttpError(422, "You cannot remove your own administrator role");
  if (id === actor.id && input.isActive === false) throw new HttpError(422, "You cannot deactivate your own account");
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: nowIso() };
  if (input.email) {
    const dupe = await db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (dupe && dupe.id !== id) throw new HttpError(409, "A user with this e-mail already exists");
    patch.email = input.email;
  }
  if (input.name) patch.name = input.name;
  if (input.role) patch.role = input.role;
  if (input.managerId !== undefined) patch.managerId = input.managerId || null;
  if (input.approvalLimitPct !== undefined) patch.approvalLimitBps = Math.round(input.approvalLimitPct * 100);
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.notifyByEmail !== undefined) patch.notifyByEmail = input.notifyByEmail;
  let temporaryPassword: string | undefined;
  if (input.password !== undefined) {
    const pwd = input.password || generateTempPassword();
    const weak = validatePasswordStrength(pwd);
    if (weak) throw new HttpError(422, weak);
    patch.passwordHash = await hashPassword(pwd);
    patch.mustChangePassword = true;
    if (!input.password) temporaryPassword = pwd;
  }
  await db.update(users).set(patch).where(eq(users.id, id));
  if (input.propertyIds) await setUserProperties(id, input.propertyIds);
  if (input.isActive === false || input.password !== undefined) await destroyAllSessionsForUser(id);
  const { passwordHash: _b, ...beforeSafe } = before;
  void _b;
  const { passwordHash: _a, ...patchSafe } = patch;
  void _a;
  await writeAudit({ userId: actor.id, action: "user.update", entityType: "user", entityId: id, before: beforeSafe, after: patchSafe, ip: meta.ip });
  return { temporaryPassword };
}

async function setUserProperties(userId: string, propertyIds: string[]) {
  const db = getDb();
  await db.delete(userProperties).where(eq(userProperties.userId, userId));
  if (propertyIds.length) {
    const valid = await db.select({ id: properties.id }).from(properties).where(inArray(properties.id, propertyIds));
    if (valid.length) await db.insert(userProperties).values(valid.map((p) => ({ userId, propertyId: p.id })));
  }
}

export async function changeOwnPassword(user: CurrentUser, currentPassword: string, newPassword: string) {
  const db = getDb();
  const row = await db.query.users.findFirst({ where: and(eq(users.id, user.id), eq(users.isActive, true)) });
  if (!row) throw new HttpError(404, "User not found");
  const { verifyPassword } = await import("../auth/password");
  if (!(await verifyPassword(currentPassword, row.passwordHash))) throw new HttpError(422, "Current password is incorrect");
  const weak = validatePasswordStrength(newPassword);
  if (weak) throw new HttpError(422, weak);
  await db.update(users).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, updatedAt: nowIso() }).where(eq(users.id, user.id));
  await writeAudit({ userId: user.id, action: "user.password_change", entityType: "user", entityId: user.id });
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `Fl${out}9`;
}
