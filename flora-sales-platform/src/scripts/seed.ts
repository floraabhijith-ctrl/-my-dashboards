/**
 * Seeds reference data and (optionally) fictional demonstration enquiries.
 *
 *   npm run db:seed        -> properties + bootstrap admin only (production safe, idempotent)
 *   npm run db:seed:demo   -> also creates fictional users and DEMO enquiries (isDemo = true)
 *
 * Demo records are flagged `isDemo` and can be hidden from reporting in Settings.
 */
import { loadEnv } from "./env";
loadEnv();
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { properties, users, userProperties, enquiries } from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";
import { newId } from "../lib/ids";
import { createEnquiry, addFollowUp, addQuotation, updateEnquiry, decideApproval, listApprovals } from "../lib/enquiries/service";
import { loadUserContext } from "../lib/auth/session";
import { addDaysToDateOnly, todayInTz } from "../lib/dates";
import { saveSettings } from "../lib/settings";
import type { EnquiryInput } from "../lib/validation/enquiry";

const PROPERTIES = [
  { code: "FCH", name: "Flora Creek Deluxe Hotel Apartments", shortName: "Flora Creek", sortOrder: 1 },
  { code: "FIH", name: "Flora Inn Hotel Dubai Airport", shortName: "Flora Inn", sortOrder: 2 },
  { code: "FAB", name: "Flora Al Barsha Hotel at the Mall", shortName: "Flora Al Barsha", sortOrder: 3 },
];

/** Fictional test accounts. Passwords are for demo environments only. */
export const DEMO_USERS = [
  { email: "manager.creek@demo.flora", name: "Maya Haddad (Demo Manager)", role: "SALES_MANAGER", password: "Manager!2026", approvalLimitPct: 15, properties: ["FCH"] },
  { email: "manager.inn@demo.flora", name: "Omar Siddiqui (Demo Manager)", role: "SALES_MANAGER", password: "Manager!2026", approvalLimitPct: 12, properties: ["FIH", "FAB"] },
  { email: "sales.ayesha@demo.flora", name: "Ayesha Khan (Demo Sales)", role: "SALES_EXECUTIVE", password: "Sales!2026", manager: "manager.creek@demo.flora", properties: ["FCH"] },
  { email: "sales.ravi@demo.flora", name: "Ravi Menon (Demo Sales)", role: "SALES_EXECUTIVE", password: "Sales!2026", manager: "manager.creek@demo.flora", properties: ["FCH"] },
  { email: "sales.lena@demo.flora", name: "Lena Petrova (Demo Sales)", role: "SALES_EXECUTIVE", password: "Sales!2026", manager: "manager.inn@demo.flora", properties: ["FIH"] },
  { email: "sales.tariq@demo.flora", name: "Tariq Al Amin (Demo Sales)", role: "SALES_EXECUTIVE", password: "Sales!2026", manager: "manager.inn@demo.flora", properties: ["FAB"] },
] as const;

async function upsertProperties() {
  const db = getDb();
  const map = new Map<string, string>();
  for (const p of PROPERTIES) {
    const existing = await db.query.properties.findFirst({ where: eq(properties.code, p.code) });
    if (existing) {
      map.set(p.code, existing.id);
      continue;
    }
    const id = newId();
    await db.insert(properties).values({ id, ...p, city: "Dubai", isActive: true });
    map.set(p.code, id);
  }
  return map;
}

async function upsertAdmin() {
  const db = getDb();
  const email = (process.env.ADMIN_EMAIL ?? "admin@florahospitality.com").toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return existing.id;
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe!2026";
  const id = newId();
  await db.insert(users).values({ id, email, name: process.env.ADMIN_NAME ?? "Commercial Head", passwordHash: await hashPassword(password), role: "ADMIN", approvalLimitBps: 10000, mustChangePassword: !process.env.ADMIN_PASSWORD });
  console.log(`Created administrator ${email}`);
  return id;
}

async function upsertDemoUsers(propMap: Map<string, string>) {
  const db = getDb();
  const ids = new Map<string, string>();
  for (const u of DEMO_USERS) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, u.email) });
    if (existing) {
      ids.set(u.email, existing.id);
      continue;
    }
    const id = newId();
    await db.insert(users).values({
      id,
      email: u.email,
      name: u.name,
      passwordHash: await hashPassword(u.password),
      role: u.role,
      approvalLimitBps: Math.round(("approvalLimitPct" in u ? u.approvalLimitPct : 0) * 100),
      mustChangePassword: false,
    });
    await db.insert(userProperties).values(u.properties.map((code) => ({ userId: id, propertyId: propMap.get(code)! })));
    ids.set(u.email, id);
  }
  // Second pass: managers
  for (const u of DEMO_USERS) {
    if ("manager" in u && u.manager) {
      await db.update(users).set({ managerId: ids.get(u.manager)! }).where(eq(users.id, ids.get(u.email)!));
    }
  }
  return ids;
}

const COMPANIES = [
  ["Demo - Al Noor Trading LLC", "Fatima Rahman", "United Arab Emirates", "Corporate", "Email"],
  ["Demo - Meridian Logistics", "James Carter", "United Kingdom", "Corporate", "Telephone"],
  ["Demo - Sunrise Travel & Tours", "Priya Nair", "India", "Travel Agent", "WhatsApp"],
  ["Demo - Gulf Engineering Group", "Hassan Al Mansoori", "United Arab Emirates", "Long Stay", "Corporate Visit"],
  ["Demo - Nordic Airlines Crew", "Elin Berg", "Sweden", "Group", "Email"],
  ["Demo - Orbit Medical Devices", "Chen Wei", "China", "Corporate", "Website"],
  ["Demo - Atlas Events DMC", "Sophie Martin", "France", "Group", "Referral"],
  ["Demo - Pearl Consulting", "Ahmed Yusuf", "Saudi Arabia", "Direct", "Walk-in"],
  ["Demo - Horizon Oil Services", "Mark Thompson", "United States", "Long Stay", "Email"],
  ["Demo - Bright Minds Education", "Aisha Bello", "Nigeria", "Group", "Telephone"],
  ["Demo - Zenith Pharma", "Laura Rossi", "Italy", "Corporate", "Email"],
  ["Demo - Desert Rose Weddings", "Noor Al Sayed", "United Arab Emirates", "Group", "WhatsApp"],
] as const;

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

async function seedDemoEnquiries(userIds: Map<string, string>, propMap: Map<string, string>) {
  const db = getDb();
  const existing = await db.select({ id: enquiries.id }).from(enquiries).where(eq(enquiries.isDemo, true)).limit(1);
  if (existing.length) {
    console.log("Demo enquiries already present - skipping.");
    return;
  }
  const rnd = seededRandom(42);
  const today = todayInTz();
  const salesEmails = DEMO_USERS.filter((u) => u.role === "SALES_EXECUTIVE");
  const statuses = ["New Enquiry", "Contacted", "Qualified", "Quotation Sent", "Negotiation", "Awaiting Client", "Confirmed", "Confirmed", "Lost", "Quotation Sent", "Negotiation", "Contacted"] as const;
  let n = 0;
  for (let i = 0; i < 36; i++) {
    const company = COMPANIES[i % COMPANIES.length];
    const seller = salesEmails[i % salesEmails.length];
    const sellerCtx = await loadUserContext(userIds.get(seller.email)!);
    if (!sellerCtx) continue;
    const propertyCode = seller.properties[0];
    const createdOffset = -Math.floor(rnd() * 120); // enquiries over the last 4 months
    const arrivalOffset = 10 + Math.floor(rnd() * 150);
    const isLong = company[3] === "Long Stay";
    const nights = isLong ? 30 + Math.floor(rnd() * 60) : 2 + Math.floor(rnd() * 6);
    const rooms = company[3] === "Group" ? 10 + Math.floor(rnd() * 30) : 1 + Math.floor(rnd() * 5);
    const arrival = addDaysToDateOnly(today, arrivalOffset);
    const departure = addDaysToDateOnly(arrival, nights);
    const basis = isLong ? "Monthly Package" : "Per Room Per Night";
    const proposed = isLong ? 7500 + Math.floor(rnd() * 4000) : 320 + Math.floor(rnd() * 400);
    const requested = Math.round(proposed * (0.8 + rnd() * 0.15));
    const status = statuses[i % statuses.length];
    const input: EnquiryInput = {
      propertyId: propMap.get(propertyCode)!,
      source: company[4],
      enquiryType: company[3],
      priority: rooms > 15 || isLong ? "High" : rnd() > 0.5 ? "Medium" : "Low",
      companyName: company[0],
      contactPerson: company[1],
      email: `${company[1].toLowerCase().replace(/[^a-z]/g, ".")}@example.com`,
      phone: `+971 5${Math.floor(10000000 + rnd() * 89999999)}`,
      country: company[2],
      accountType: rnd() > 0.6 ? "Existing" : "New",
      clientRemarks: "Fictional demonstration enquiry.",
      arrivalDate: arrival,
      departureDate: departure,
      rooms,
      roomCategory: isLong ? "One Bedroom Apartment" : rnd() > 0.5 ? "Deluxe Room" : "Superior Room",
      guests: rooms * 2,
      mealPlan: isLong ? "Room Only" : "Bed & Breakfast",
      additionalRequirements: rnd() > 0.7 ? "Airport transfers and early check-in requested." : null,
      stayType: null,
      requestedRate: requested,
      proposedRate: proposed,
      revisedRate: null,
      rateBasis: basis,
      taxInclusion: "Inclusive of taxes",
      probability: status === "Confirmed" ? 100 : status === "Lost" ? 0 : 30 + Math.floor(rnd() * 50),
      status: "New Enquiry",
      lostReason: null,
      lastFollowUpAt: null,
      nextFollowUpAt: addDaysToDateOnly(today, -5 + Math.floor(rnd() * 12)),
      followUpMethod: null,
      latestClientResponse: null,
      nextAction: "Send proposal and confirm availability",
      salesNotes: null,
      delayReason: null,
      rateChangeReason: null,
      idempotencyKey: `demo-${i}`,
    };
    const { enquiry } = await createEnquiry(sellerCtx, input);
    // Progress the record through its lifecycle for realistic history
    const createdAt = `${addDaysToDateOnly(today, createdOffset)}T${String(8 + (i % 9)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00.000Z`;
    await db.update(enquiries).set({ createdAt, lastActivityAt: addDaysToDateOnly(today, createdOffset + Math.floor(rnd() * 10)) + "T09:00:00.000Z", isDemo: true }).where(eq(enquiries.id, enquiry.id));
    if (status !== "New Enquiry") {
      await addFollowUp(sellerCtx, enquiry.id, { method: "Telephone", note: "Discussed requirement and confirmed dates.", clientResponse: "Interested, awaiting proposal.", nextAction: "Send quotation", nextFollowUpAt: input.nextFollowUpAt, newStatus: "Contacted", lostReason: null });
    }
    if (["Quotation Sent", "Negotiation", "Awaiting Client", "Confirmed", "Lost"].includes(status)) {
      await addQuotation(sellerCtx, enquiry.id, { note: "Quotation issued", quotedRate: proposed, validUntil: addDaysToDateOnly(today, 14), reference: `Q-${1000 + i}` });
    }
    if (["Negotiation", "Awaiting Client", "Confirmed", "Lost"].includes(status)) {
      const revised = Math.round(proposed * (0.85 + rnd() * 0.1));
      const fresh = (await db.query.enquiries.findFirst({ where: eq(enquiries.id, enquiry.id) }))!;
      await updateEnquiry(sellerCtx, enquiry.id, { ...input, revisedRate: revised, status: status === "Confirmed" || status === "Lost" ? "Negotiation" : status, version: fresh.version, rateChangeReason: "Client negotiated volume discount", lostReason: null });
    }
    if (status === "Confirmed" || status === "Lost") {
      const fresh = (await db.query.enquiries.findFirst({ where: eq(enquiries.id, enquiry.id) }))!;
      if (fresh.status === "Awaiting Internal Approval") {
        const mgr = await loadUserContext(userIds.get(seller.manager)!);
        const pending = (await listApprovals(mgr!, "PENDING")).find((a) => a.enquiryId === enquiry.id);
        if (pending && mgr) {
          const admin = await loadUserContext((await db.query.users.findFirst({ where: eq(users.role, "ADMIN") }))!.id);
          await decideApproval(pending.canDecide ? mgr : admin!, pending.id, status === "Confirmed" ? "APPROVED" : "REJECTED", "Demo decision");
        }
      }
      await addFollowUp(sellerCtx, enquiry.id, {
        method: "Email",
        note: status === "Confirmed" ? "Client confirmed in writing." : "Client chose a competitor on price.",
        clientResponse: status === "Confirmed" ? "Confirmed" : "Declined",
        nextAction: status === "Confirmed" ? "Issue contract and collect deposit" : null,
        nextFollowUpAt: null,
        newStatus: status,
        lostReason: status === "Lost" ? "Rate above client budget" : null,
      });
    }
    // Reset lastActivity to a plausible past timestamp so inactivity monitoring has data
    await db.update(enquiries).set({ lastActivityAt: addDaysToDateOnly(today, -Math.floor(rnd() * 12)) + "T10:00:00.000Z" }).where(eq(enquiries.id, enquiry.id));
    n++;
  }
  console.log(`Created ${n} demonstration enquiries (flagged isDemo).`);
}

async function main() {
  const db = getDb();
  await runMigrations(db);
  const propMap = await upsertProperties();
  const adminId = await upsertAdmin();
  console.log(`Properties ready: ${[...propMap.keys()].join(", ")}`);
  if (process.env.SEED_DEMO === "true") {
    const userIds = await upsertDemoUsers(propMap);
    await saveSettings({ includeDemoData: true }, adminId);
    await seedDemoEnquiries(userIds, propMap);
    console.log("\nDemo accounts (fictional):");
    for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(16)} ${u.email.padEnd(28)} ${u.password}`);
    console.log(`  ADMIN            ${process.env.ADMIN_EMAIL ?? "admin@florahospitality.com"}  ${process.env.ADMIN_PASSWORD ?? "ChangeMe!2026"}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
