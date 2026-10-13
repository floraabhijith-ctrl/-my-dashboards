import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { properties } from "../db/schema";
import { newId } from "../ids";
import { nowIso } from "../dates";
import { writeAudit } from "../audit";
import { AuthzError } from "../authz";
import type { CurrentUser } from "../auth/session";
import { HttpError } from "../http";

export const propertyInputSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, "Code must be 2-6 letters/digits"),
  name: z.string().trim().min(3).max(120),
  shortName: z.string().trim().min(2).max(40),
  city: z.string().trim().min(2).max(60).default("Dubai"),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export async function listProperties(opts: { includeInactive?: boolean } = {}) {
  const rows = await getDb().select().from(properties).orderBy(asc(properties.sortOrder), asc(properties.name));
  return opts.includeInactive ? rows : rows.filter((p) => p.isActive);
}

export async function createProperty(actor: CurrentUser, input: z.infer<typeof propertyInputSchema>) {
  if (actor.role !== "ADMIN") throw new AuthzError();
  const db = getDb();
  const dupe = await db.query.properties.findFirst({ where: eq(properties.code, input.code) });
  if (dupe) throw new HttpError(409, "Property code already exists");
  const id = newId();
  await db.insert(properties).values({ id, ...input });
  await writeAudit({ userId: actor.id, action: "property.create", entityType: "property", entityId: id, after: input });
  return id;
}

export async function updateProperty(actor: CurrentUser, id: string, input: Partial<z.infer<typeof propertyInputSchema>>) {
  if (actor.role !== "ADMIN") throw new AuthzError();
  const db = getDb();
  const before = await db.query.properties.findFirst({ where: eq(properties.id, id) });
  if (!before) throw new HttpError(404, "Property not found");
  if (input.code && input.code !== before.code) {
    const dupe = await db.query.properties.findFirst({ where: eq(properties.code, input.code) });
    if (dupe) throw new HttpError(409, "Property code already exists");
  }
  await db.update(properties).set({ ...input, updatedAt: nowIso() }).where(eq(properties.id, id));
  await writeAudit({ userId: actor.id, action: "property.update", entityType: "property", entityId: id, before, after: input });
}
