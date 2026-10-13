import { handle, json, requireUser } from "@/lib/http";
import { recentActivityFeed } from "@/lib/analytics/service";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json({ activity: await recentActivityFeed(user, 30) });
});
