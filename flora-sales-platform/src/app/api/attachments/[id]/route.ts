import { handle, json, requireUser } from "@/lib/http";
import { getAttachment, removeAttachment } from "@/lib/enquiries/attachments";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const a = await getAttachment(user, id);
  return new Response(new Uint8Array(a.content), {
    headers: {
      "content-type": a.mimeType,
      "content-length": String(a.sizeBytes),
      "content-disposition": `attachment; filename="${encodeURIComponent(a.fileName)}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await removeAttachment(user, id);
  return json({ ok: true });
});
