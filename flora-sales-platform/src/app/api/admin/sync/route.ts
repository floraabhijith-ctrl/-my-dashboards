import { handle, json, requireUser } from "@/lib/http";
import { AuthzError } from "@/lib/authz";
import { processOutbox, syncStatus } from "@/lib/sync/processor";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new AuthzError();
  return json(await syncStatus());
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new AuthzError();
  return json(await processOutbox(200));
});
