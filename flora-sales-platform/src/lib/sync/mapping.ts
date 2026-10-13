/**
 * Column mapping shared by the Google Sheets and Microsoft Lists adapters.
 * The first column (Enquiry Ref) is the upsert key in both providers.
 * Money is exported in AED (not fils); percentages as plain percent.
 */
export const ENQUIRY_COLUMNS: { header: string; listField: string; pick: (e: Record<string, unknown>) => unknown }[] = [
  { header: "Enquiry Ref", listField: "Title", pick: (e) => e.enquiryRef },
  { header: "Enquiry ID", listField: "EnquiryId", pick: (e) => e.id },
  { header: "Created At (UTC)", listField: "CreatedAtUtc", pick: (e) => e.createdAt },
  { header: "Updated At (UTC)", listField: "UpdatedAtUtc", pick: (e) => e.updatedAt },
  { header: "Property", listField: "Property", pick: (e) => e.propertyName },
  { header: "Property Code", listField: "PropertyCode", pick: (e) => e.propertyCode },
  { header: "Salesperson", listField: "Salesperson", pick: (e) => e.ownerName },
  { header: "Source", listField: "Source", pick: (e) => e.source },
  { header: "Enquiry Type", listField: "EnquiryType", pick: (e) => e.enquiryType },
  { header: "Priority", listField: "Priority", pick: (e) => e.priority },
  { header: "Company", listField: "Company", pick: (e) => e.companyName },
  { header: "Contact", listField: "Contact", pick: (e) => e.contactPerson },
  { header: "Email", listField: "Email", pick: (e) => e.email },
  { header: "Phone", listField: "Phone", pick: (e) => e.phone },
  { header: "Country", listField: "Country", pick: (e) => e.country },
  { header: "Account Type", listField: "AccountType", pick: (e) => e.accountType },
  { header: "Arrival", listField: "Arrival", pick: (e) => e.arrivalDate },
  { header: "Departure", listField: "Departure", pick: (e) => e.departureDate },
  { header: "Nights", listField: "Nights", pick: (e) => e.nights },
  { header: "Rooms", listField: "Rooms", pick: (e) => e.rooms },
  { header: "Room Category", listField: "RoomCategory", pick: (e) => e.roomCategory },
  { header: "Guests", listField: "Guests", pick: (e) => e.guests },
  { header: "Meal Plan", listField: "MealPlan", pick: (e) => e.mealPlan },
  { header: "Stay Type", listField: "StayType", pick: (e) => e.stayType },
  { header: "Rate Basis", listField: "RateBasis", pick: (e) => e.rateBasis },
  { header: "Tax", listField: "TaxInclusion", pick: (e) => e.taxInclusion },
  { header: "Requested Rate (AED)", listField: "RequestedRate", pick: (e) => aed(e.requestedRate) },
  { header: "Proposed Rate (AED)", listField: "ProposedRate", pick: (e) => aed(e.proposedRate) },
  { header: "Revised Rate (AED)", listField: "RevisedRate", pick: (e) => aed(e.revisedRate) },
  { header: "Approved Rate (AED)", listField: "ApprovedRate", pick: (e) => aed(e.approvedRate) },
  { header: "Discount %", listField: "DiscountPct", pick: (e) => pct(e.discountBps) },
  { header: "Total Room Nights", listField: "TotalRoomNights", pick: (e) => e.totalRoomNights },
  { header: "Potential Revenue (AED)", listField: "PotentialRevenue", pick: (e) => aed(e.potentialRevenue) },
  { header: "Probability %", listField: "Probability", pick: (e) => e.probability },
  { header: "Expected Value (AED)", listField: "ExpectedValue", pick: (e) => aed(e.expectedBookingValue) },
  { header: "Status", listField: "Status", pick: (e) => e.status },
  { header: "Last Follow-up", listField: "LastFollowUp", pick: (e) => e.lastFollowUpAt },
  { header: "Next Follow-up", listField: "NextFollowUp", pick: (e) => e.nextFollowUpAt },
  { header: "Follow-up Method", listField: "FollowUpMethod", pick: (e) => e.followUpMethod },
  { header: "Latest Client Response", listField: "LatestClientResponse", pick: (e) => e.latestClientResponse },
  { header: "Next Action", listField: "NextAction", pick: (e) => e.nextAction },
  { header: "Notes", listField: "Notes", pick: (e) => e.salesNotes },
  { header: "Delay Reason", listField: "DelayReason", pick: (e) => e.delayReason },
  { header: "Lost Reason", listField: "LostReason", pick: (e) => e.lostReason },
  { header: "Confirmed At (UTC)", listField: "ConfirmedAtUtc", pick: (e) => e.confirmedAt },
  { header: "Deleted At (UTC)", listField: "DeletedAtUtc", pick: (e) => e.deletedAt },
  { header: "Demo Record", listField: "IsDemo", pick: (e) => (e.isDemo ? "Yes" : "No") },
];

export const ACTIVITY_COLUMNS: { header: string; listField: string; pick: (a: Record<string, unknown>) => unknown }[] = [
  { header: "Activity ID", listField: "Title", pick: (a) => a.id },
  { header: "Enquiry ID", listField: "EnquiryId", pick: (a) => a.enquiryId },
  { header: "Timestamp (UTC)", listField: "TimestampUtc", pick: (a) => a.createdAt },
  { header: "User ID", listField: "UserId", pick: (a) => a.userId },
  { header: "Type", listField: "ActivityType", pick: (a) => a.type },
  { header: "From Status", listField: "FromStatus", pick: (a) => a.fromStatus },
  { header: "To Status", listField: "ToStatus", pick: (a) => a.toStatus },
  { header: "Note", listField: "Note", pick: (a) => a.note },
  { header: "Client Feedback", listField: "ClientFeedback", pick: (a) => a.clientFeedback },
  { header: "Next Action", listField: "NextAction", pick: (a) => a.nextAction },
  { header: "Method", listField: "Method", pick: (a) => a.followUpMethod },
  { header: "Data (JSON)", listField: "DataJson", pick: (a) => a.data },
];

export const RATE_COLUMNS: { header: string; listField: string; pick: (r: Record<string, unknown>) => unknown }[] = [
  { header: "Revision ID", listField: "Title", pick: (r) => r.id },
  { header: "Enquiry ID", listField: "EnquiryId", pick: (r) => r.enquiryId },
  { header: "Timestamp (UTC)", listField: "TimestampUtc", pick: (r) => r.createdAt },
  { header: "User ID", listField: "UserId", pick: (r) => r.userId },
  { header: "Field", listField: "RateField", pick: (r) => r.field },
  { header: "Previous (AED)", listField: "PreviousValue", pick: (r) => aed(r.previousValue) },
  { header: "New (AED)", listField: "NewValue", pick: (r) => aed(r.newValue) },
  { header: "Rate Basis", listField: "RateBasis", pick: (r) => r.rateBasis },
  { header: "Reason", listField: "Reason", pick: (r) => r.reason },
];

function aed(v: unknown) {
  return typeof v === "number" ? v / 100 : null;
}
function pct(v: unknown) {
  return typeof v === "number" ? v / 100 : null;
}

export const SHEET_TABS = { enquiry: "Enquiries", activity: "Activities", rate_revision: "RateRevisions" } as const;
