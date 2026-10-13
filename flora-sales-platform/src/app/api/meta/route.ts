import { handle, json, requireUser } from "@/lib/http";
import { listProperties } from "@/lib/admin/properties";
import { assignableUsers } from "@/lib/admin/users";
import { getSettings } from "@/lib/settings";
import { ENQUIRY_SOURCES, ENQUIRY_TYPES, PRIORITIES, ACCOUNT_TYPES, STAY_TYPES, MEAL_PLANS, RATE_BASES, TAX_INCLUSIONS, FOLLOW_UP_METHODS, ENQUIRY_STATUSES } from "@/lib/db/schema";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const [properties, users, settings] = await Promise.all([listProperties(), assignableUsers(user), getSettings()]);
  return json({
    properties: properties.filter((p) => user.role !== "SALES_MANAGER" || user.propertyIds.length === 0 || user.propertyIds.includes(p.id)),
    users,
    settings: { longStayThresholdNights: settings.longStayThresholdNights, approvalDiscountThresholdPct: settings.approvalDiscountThresholdPct, highValueThresholdAed: settings.highValueThresholdAed },
    enums: { ENQUIRY_SOURCES, ENQUIRY_TYPES, PRIORITIES, ACCOUNT_TYPES, STAY_TYPES, MEAL_PLANS, RATE_BASES, TAX_INCLUSIONS, FOLLOW_UP_METHODS, ENQUIRY_STATUSES },
  });
});
