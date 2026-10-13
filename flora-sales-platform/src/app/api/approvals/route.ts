import { handle, json, requireUser } from "@/lib/http";
import { listApprovals } from "@/lib/enquiries/service";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return json({ approvals: await listApprovals(user, status) });
});
