import { z } from "zod";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { addNote } from "@/lib/enquiries/service";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { note } = z.object({ note: z.string().trim().min(1).max(4000) }).parse(await readJson(req));
  return json({ enquiry: await addNote(user, id, note) }, { status: 201 });
});
