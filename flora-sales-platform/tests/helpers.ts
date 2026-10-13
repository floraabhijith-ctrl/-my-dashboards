import { createDb, setDb, getDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { properties, users, userProperties } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { newId } from "@/lib/ids";
import { createSession, loadUserContext, SESSION_COOKIE, type CurrentUser } from "@/lib/auth/session";
import { addDaysToDateOnly, todayInTz } from "@/lib/dates";
import type { EnquiryInput } from "@/lib/validation/enquiry";
import { eq } from "drizzle-orm";

process.env.SYNC_PROVIDER = "none";
process.env.EMAIL_PROVIDER = "console";
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.CRON_SECRET = "test-cron-secret";

export interface Fixture {
  props: { FCH: string; FIH: string; FAB: string };
  admin: CurrentUser;
  managerCreek: CurrentUser; // manages ayesha + ravi, property FCH
  managerInn: CurrentUser; // manages lena, property FIH
  ayesha: CurrentUser;
  ravi: CurrentUser;
  lena: CurrentUser;
  tokens: Record<string, string>;
}

export async function freshDb(): Promise<Fixture> {
  const inst = createDb("file::memory:?cache=shared");
  setDb(inst);
  const db = getDb();
  await runMigrations(db);
  const props = { FCH: newId(), FIH: newId(), FAB: newId() };
  await db.insert(properties).values([
    { id: props.FCH, code: "FCH", name: "Flora Creek Deluxe Hotel Apartments", shortName: "Flora Creek", sortOrder: 1 },
    { id: props.FIH, code: "FIH", name: "Flora Inn Hotel Dubai Airport", shortName: "Flora Inn", sortOrder: 2 },
    { id: props.FAB, code: "FAB", name: "Flora Al Barsha Hotel at the Mall", shortName: "Flora Al Barsha", sortOrder: 3 },
  ]);
  const hash = await hashPassword("Test!Pass2026");
  const ids = { admin: newId(), mc: newId(), mi: newId(), ayesha: newId(), ravi: newId(), lena: newId() };
  await db.insert(users).values([
    { id: ids.admin, email: "admin@test", name: "Admin", passwordHash: hash, role: "ADMIN", approvalLimitBps: 10000 },
    { id: ids.mc, email: "mc@test", name: "Manager Creek", passwordHash: hash, role: "SALES_MANAGER", approvalLimitBps: 1500 },
    { id: ids.mi, email: "mi@test", name: "Manager Inn", passwordHash: hash, role: "SALES_MANAGER", approvalLimitBps: 1000 },
    { id: ids.ayesha, email: "ayesha@test", name: "Ayesha", passwordHash: hash, role: "SALES_EXECUTIVE", managerId: ids.mc },
    { id: ids.ravi, email: "ravi@test", name: "Ravi", passwordHash: hash, role: "SALES_EXECUTIVE", managerId: ids.mc },
    { id: ids.lena, email: "lena@test", name: "Lena", passwordHash: hash, role: "SALES_EXECUTIVE", managerId: ids.mi },
  ]);
  await db.insert(userProperties).values([
    { userId: ids.mc, propertyId: props.FCH },
    { userId: ids.mi, propertyId: props.FIH },
  ]);
  const ctx = async (id: string) => (await loadUserContext(id))!;
  const tokens: Record<string, string> = {};
  for (const [k, id] of Object.entries(ids)) {
    const u = (await db.query.users.findFirst({ where: eq(users.id, id) }))!;
    tokens[k] = (await createSession(u, {})).token;
  }
  return {
    props,
    admin: await ctx(ids.admin),
    managerCreek: await ctx(ids.mc),
    managerInn: await ctx(ids.mi),
    ayesha: await ctx(ids.ayesha),
    ravi: await ctx(ids.ravi),
    lena: await ctx(ids.lena),
    tokens,
  };
}

export function sampleInput(propertyId: string, overrides: Partial<EnquiryInput> = {}): EnquiryInput {
  const today = todayInTz();
  return {
    propertyId,
    source: "Email",
    enquiryType: "Corporate",
    priority: "Medium",
    companyName: "Acme Trading LLC",
    contactPerson: "Jane Doe",
    email: "jane@example.com",
    phone: "+971500000000",
    country: "UAE",
    accountType: "New",
    clientRemarks: null,
    arrivalDate: addDaysToDateOnly(today, 30),
    departureDate: addDaysToDateOnly(today, 35),
    rooms: 4,
    roomCategory: "Deluxe",
    guests: 8,
    mealPlan: "Bed & Breakfast",
    additionalRequirements: null,
    stayType: null,
    requestedRate: 400,
    proposedRate: 500,
    revisedRate: null,
    rateBasis: "Per Room Per Night",
    taxInclusion: "Inclusive of taxes",
    probability: 50,
    status: "New Enquiry",
    lostReason: null,
    lastFollowUpAt: null,
    nextFollowUpAt: addDaysToDateOnly(today, 2),
    followUpMethod: null,
    latestClientResponse: null,
    nextAction: "Send proposal",
    salesNotes: null,
    delayReason: null,
    rateChangeReason: null,
    ...overrides,
  };
}

/** Build a Request carrying a session cookie, as a browser or API client would. */
export function req(path: string, token: string | null, init: { method?: string; body?: unknown; form?: FormData } = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `${SESSION_COOKIE}=${token}`;
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  return new Request(`http://localhost${path}`, { method: init.method ?? "GET", headers, body });
}
export const params = (p: { id: string }) => ({ params: Promise.resolve(p) });
