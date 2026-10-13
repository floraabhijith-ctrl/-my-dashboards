import { handle, json, requireUser } from "@/lib/http";
import { AuthzError } from "@/lib/authz";
import { runAlertSweep } from "@/lib/notifications/alerts";

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  if (user.role !== "ADMIN") throw new AuthzError();
  return json(await runAlertSweep());
});
