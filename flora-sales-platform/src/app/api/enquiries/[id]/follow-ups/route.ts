import { handle, json, readJson, requireUser } from "@/lib/http";
import { followUpSchema } from "@/lib/validation/enquiry";
import { addFollowUp } from "@/lib/enquiries/service";
import { scheduleSync } from "@/lib/sync/schedule";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const input = followUpSchema.parse(await readJson(req));
  const enquiry = await addFollowUp(user, id, input);
  scheduleSync();
  return json({ enquiry }, { status: 201 });
});
