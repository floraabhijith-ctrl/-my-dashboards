import { requireRole } from "@/lib/authz";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { listProperties, createProperty, propertyInputSchema } from "@/lib/admin/properties";

export const GET = handle(async (req: Request) => {
  await requireUser(req);
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "true";
  return json({ properties: await listProperties({ includeInactive }) });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  requireRole(user, ["ADMIN"]);
  const input = propertyInputSchema.parse(await readJson(req));
  return json({ id: await createProperty(user, input) }, { status: 201 });
});
