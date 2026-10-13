import { handle, json, HttpError } from "@/lib/http";
import { processOutbox } from "@/lib/sync/processor";
import { timingSafeEqual } from "node:crypto";

function authorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export const GET = handle(async (req: Request) => {
  if (!authorised(req)) throw new HttpError(401, "Unauthorised");
  return json(await processOutbox(200));
});
