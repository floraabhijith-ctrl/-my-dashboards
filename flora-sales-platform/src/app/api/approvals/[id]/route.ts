import { handle, json, readJson, requireUser } from "@/lib/http";
import { approvalDecisionSchema } from "@/lib/validation/enquiry";
import { decideApproval } from "@/lib/enquiries/service";
import { scheduleSync } from "@/lib/sync/schedule";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const input = approvalDecisionSchema.parse(await readJson(req));
  const enquiry = await decideApproval(user, id, input.decision, input.note ?? null);
  scheduleSync();
  return json({ enquiry });
});
