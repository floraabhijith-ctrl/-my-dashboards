import { handle, json, requireUser } from "@/lib/http";
import { workspaceSummary } from "@/lib/analytics/service";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json(await workspaceSummary(user));
});
