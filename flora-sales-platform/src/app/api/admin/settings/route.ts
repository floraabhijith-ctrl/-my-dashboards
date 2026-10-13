import { z } from "zod";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { AuthzError } from "@/lib/authz";
import { getSettings, saveSettings } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  longStayThresholdNights: z.coerce.number().int().min(1).max(365).optional(),
  inactivityWarningDays: z.coerce.number().int().min(1).max(90).optional(),
  inactivityCriticalDays: z.coerce.number().int().min(1).max(180).optional(),
  highValueThresholdAed: z.coerce.number().min(0).optional(),
  approvalDiscountThresholdPct: z.coerce.number().min(0).max(100).optional(),
  followUpReminderDaysBefore: z.coerce.number().int().min(0).max(30).optional(),
  includeDemoData: z.boolean().optional(),
  quotationAwaitingDays: z.coerce.number().int().min(1).max(90).optional(),
});

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new AuthzError();
  return json({ settings: await getSettings() });
});

export const PATCH = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new AuthzError();
  const patch = schema.parse(await readJson(req));
  const before = await getSettings();
  const settings = await saveSettings(patch, user.id);
  await writeAudit({ userId: user.id, action: "settings.update", entityType: "settings", entityId: "app", before, after: settings });
  return json({ settings });
});
