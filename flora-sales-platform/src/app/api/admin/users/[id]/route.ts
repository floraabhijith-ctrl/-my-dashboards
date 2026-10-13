import { requireRole } from "@/lib/authz";
import { handle, json, readJson, requireUser, clientIp } from "@/lib/http";
import { updateUser, userInputSchema } from "@/lib/admin/users";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  requireRole(user, ["ADMIN"]);
  const { id } = await ctx.params;
  const input = userInputSchema.partial().parse(await readJson(req));
  return json(await updateUser(user, id, input, { ip: clientIp(req) }));
});
