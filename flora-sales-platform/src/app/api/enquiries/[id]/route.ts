import { z } from "zod";
import { handle, json, readJson, requireUser, clientIp } from "@/lib/http";
import { enquiryInputSchema } from "@/lib/validation/enquiry";
import { getEnquiryDetail, updateEnquiry, deleteEnquiry } from "@/lib/enquiries/service";
import { scheduleSync } from "@/lib/sync/schedule";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return json(await getEnquiryDetail(user, id));
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const input = enquiryInputSchema.parse(await readJson(req));
  const enquiry = await updateEnquiry(user, id, input, { ip: clientIp(req) });
  scheduleSync();
  return json({ enquiry });
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = z.object({ reason: z.string().max(500).optional() }).parse(await req.json().catch(() => ({})));
  await deleteEnquiry(user, id, body.reason ?? null, { ip: clientIp(req) });
  scheduleSync();
  return json({ ok: true });
});
