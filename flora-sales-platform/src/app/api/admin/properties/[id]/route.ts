import { requireRole } from "@/lib/authz";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { updateProperty, propertyInputSchema } from "@/lib/admin/properties";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  requireRole(user, ["ADMIN"]);
  const { id } = await ctx.params;
  const input = propertyInputSchema.partial().parse(await readJson(req));
  await updateProperty(user, id, input);
  return json({ ok: true });
});
