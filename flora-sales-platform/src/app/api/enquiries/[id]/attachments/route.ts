import { handle, json, requireUser, HttpError } from "@/lib/http";
import { addAttachment, MAX_ATTACHMENT_BYTES } from "@/lib/enquiries/attachments";
import { getEnquiryDetail } from "@/lib/enquiries/service";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const detail = await getEnquiryDetail(user, id);
  return json({ attachments: detail.attachments });
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "Expected multipart form data");
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(422, "No file provided");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new HttpError(422, "File exceeds the 5 MB limit");
  const kind = String(form.get("kind") ?? "Supporting Document").slice(0, 40);
  const bytes = Buffer.from(await file.arrayBuffer());
  const saved = await addAttachment(user, id, { name: file.name, type: file.type, bytes, kind });
  return json({ attachment: saved }, { status: 201 });
});
