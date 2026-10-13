import { z } from "zod";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { findDuplicates } from "@/lib/enquiries/service";

const schema = z.object({ companyName: z.string().trim().min(2), propertyId: z.string().min(1), arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), excludeId: z.string().optional() });

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const input = schema.parse(await readJson(req));
  return json({ duplicates: await findDuplicates(user, input) });
});
