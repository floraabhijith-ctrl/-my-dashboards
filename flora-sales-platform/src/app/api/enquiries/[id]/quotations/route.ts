import { handle, json, readJson, requireUser } from "@/lib/http";
import { quotationSchema } from "@/lib/validation/enquiry";
import { addQuotation } from "@/lib/enquiries/service";
import { scheduleSync } from "@/lib/sync/schedule";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const input = quotationSchema.parse(await readJson(req));
  const enquiry = await addQuotation(user, id, { ...input, validUntil: input.validUntil || null });
  scheduleSync();
  return json({ enquiry }, { status: 201 });
});
