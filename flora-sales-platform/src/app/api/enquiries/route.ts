import { handle, json, readJson, requireUser, clientIp } from "@/lib/http";
import { enquiryInputSchema, listFiltersSchema } from "@/lib/validation/enquiry";
import { createEnquiry, listEnquiries } from "@/lib/enquiries/service";
import { scheduleSync } from "@/lib/sync/schedule";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = listFiltersSchema.parse(params);
  return json(await listEnquiries(user, filters));
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const input = enquiryInputSchema.parse(await readJson(req));
  const { enquiry, replayed } = await createEnquiry(user, input, { ip: clientIp(req) });
  scheduleSync();
  return json({ enquiry, replayed }, { status: replayed ? 200 : 201 });
});
