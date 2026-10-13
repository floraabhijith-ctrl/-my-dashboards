import { handle, requireUser } from "@/lib/http";
import { AuthzError, canExport } from "@/lib/authz";
import { listFiltersSchema } from "@/lib/validation/enquiry";
import { listEnquiries } from "@/lib/enquiries/service";
import { toCsv } from "@/lib/csv";
import { writeAudit } from "@/lib/audit";
import { todayInTz } from "@/lib/dates";

const aed = (v: number | null) => (v === null ? "" : (v / 100).toFixed(2));

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (!canExport(user)) throw new AuthzError("Exports are restricted to management users");
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = listFiltersSchema.parse({ ...params, page: 1, pageSize: 500 });
  const { items } = await listEnquiries(user, { ...filters, pageSize: 10000 });
  const rows = items.map((e) => ({
    enquiryRef: e.enquiryRef, createdAt: e.createdAt, property: e.propertyName, salesperson: e.ownerName, source: e.source, type: e.enquiryType, priority: e.priority,
    company: e.companyName, contact: e.contactPerson, email: e.email, phone: e.phone, country: e.country, accountType: e.accountType,
    arrival: e.arrivalDate, departure: e.departureDate, nights: e.nights, rooms: e.rooms, roomCategory: e.roomCategory, guests: e.guests, mealPlan: e.mealPlan, stayType: e.stayType,
    rateBasis: e.rateBasis, tax: e.taxInclusion, requested: aed(e.requestedRate), proposed: aed(e.proposedRate), revised: aed(e.revisedRate), approved: aed(e.approvedRate),
    discountPct: e.discountBps === null ? "" : (e.discountBps / 100).toFixed(2), roomNights: e.totalRoomNights, potential: aed(e.potentialRevenue), probability: e.probability, expected: aed(e.expectedBookingValue),
    status: e.status, lastFollowUp: e.lastFollowUpAt, nextFollowUp: e.nextFollowUpAt, nextAction: e.nextAction, latestResponse: e.latestClientResponse, lostReason: e.lostReason, demo: e.isDemo ? "Yes" : "No",
  }));
  const columns = [
    ["enquiryRef", "Enquiry Ref"], ["createdAt", "Created (UTC)"], ["property", "Property"], ["salesperson", "Salesperson"], ["source", "Source"], ["type", "Type"], ["priority", "Priority"],
    ["company", "Company"], ["contact", "Contact"], ["email", "Email"], ["phone", "Phone"], ["country", "Country"], ["accountType", "Account"],
    ["arrival", "Arrival"], ["departure", "Departure"], ["nights", "Nights"], ["rooms", "Rooms"], ["roomCategory", "Room Category"], ["guests", "Guests"], ["mealPlan", "Meal Plan"], ["stayType", "Stay Type"],
    ["rateBasis", "Rate Basis"], ["tax", "Tax"], ["requested", "Requested (AED)"], ["proposed", "Proposed (AED)"], ["revised", "Revised (AED)"], ["approved", "Approved (AED)"],
    ["discountPct", "Discount %"], ["roomNights", "Room Nights"], ["potential", "Potential Revenue (AED)"], ["probability", "Probability %"], ["expected", "Expected Value (AED)"],
    ["status", "Status"], ["lastFollowUp", "Last Follow-up"], ["nextFollowUp", "Next Follow-up"], ["nextAction", "Next Action"], ["latestResponse", "Latest Client Response"], ["lostReason", "Lost Reason"], ["demo", "Demo Record"],
  ].map(([key, label]) => ({ key, label }));
  await writeAudit({ userId: user.id, action: "export.enquiries", entityType: "export", entityId: todayInTz(), after: { rows: rows.length, filters } });
  return new Response(toCsv(rows, columns), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="flora-enquiries-${todayInTz()}.csv"`, "cache-control": "private, no-store" },
  });
});
