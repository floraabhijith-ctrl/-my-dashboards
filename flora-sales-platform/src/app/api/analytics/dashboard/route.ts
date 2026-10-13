import { handle, json, requireUser } from "@/lib/http";
import { listFiltersSchema } from "@/lib/validation/enquiry";
import { buildDashboard } from "@/lib/analytics/service";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = listFiltersSchema.parse({ ...params, page: 1, pageSize: 500 });
  return json(await buildDashboard(user, filters));
});
