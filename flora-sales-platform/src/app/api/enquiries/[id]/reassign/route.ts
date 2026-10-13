import { handle, json, readJson, requireUser, clientIp } from "@/lib/http";
import { reassignSchema } from "@/lib/validation/enquiry";
import { reassignEnquiry } from "@/lib/enquiries/service";
import { scheduleSync } from "@/lib/sync/schedule";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const input = reassignSchema.parse(await readJson(req));
  const enquiry = await reassignEnquiry(user, id, input.ownerId, input.note ?? null, { ip: clientIp(req) });
  scheduleSync();
  return json({ enquiry });
});
