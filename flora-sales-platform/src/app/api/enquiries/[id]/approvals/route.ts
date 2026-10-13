import { handle, json, readJson, requireUser } from "@/lib/http";
import { approvalRequestSchema } from "@/lib/validation/enquiry";
import { requestApproval } from "@/lib/enquiries/service";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const input = approvalRequestSchema.parse(await readJson(req));
  return json(await requestApproval(user, id, input), { status: 201 });
});
