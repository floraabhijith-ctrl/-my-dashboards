import { requireRole } from "@/lib/authz";
import { handle, json, readJson, requireUser, clientIp } from "@/lib/http";
import { listUsers, createUser, userInputSchema } from "@/lib/admin/users";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "true";
  return json({ users: await listUsers(user, { includeInactive }) });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  requireRole(user, ["ADMIN"]);
  const input = userInputSchema.parse(await readJson(req));
  return json(await createUser(user, input, { ip: clientIp(req) }), { status: 201 });
});
