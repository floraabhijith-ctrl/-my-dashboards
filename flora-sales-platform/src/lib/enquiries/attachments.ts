import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { attachments, enquiries } from "../db/schema";
import { newId } from "../ids";
import { nowIso } from "../dates";
import { canEditEnquiry, canViewEnquiry, AuthzError } from "../authz";
import type { CurrentUser } from "../auth/session";
import { HttpError } from "../http";
import { writeAudit } from "../audit";
import { activities } from "../db/schema";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

async function loadEnquiryForAccess(id: string) {
  return getDb().query.enquiries.findFirst({ where: eq(enquiries.id, id) });
}

export async function addAttachment(user: CurrentUser, enquiryId: string, file: { name: string; type: string; bytes: Buffer; kind?: string }) {
  const e = await loadEnquiryForAccess(enquiryId);
  if (!e || e.deletedAt || !canViewEnquiry(user, e)) throw new HttpError(404, "Enquiry not found");
  if (!canEditEnquiry(user, e)) throw new AuthzError();
  if (file.bytes.length === 0) throw new HttpError(422, "File is empty");
  if (file.bytes.length > MAX_ATTACHMENT_BYTES) throw new HttpError(422, "File exceeds the 5 MB limit");
  if (!ALLOWED_MIME.has(file.type)) throw new HttpError(422, "File type not permitted (PDF, Word, Excel, PNG, JPEG, TXT)");
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 150) || "attachment";
  const id = newId();
  const now = nowIso();
  await getDb().insert(attachments).values({
    id,
    enquiryId,
    uploadedById: user.id,
    fileName: safeName,
    mimeType: file.type,
    sizeBytes: file.bytes.length,
    kind: file.kind ?? "Supporting Document",
    content: file.bytes,
    sha256: createHash("sha256").update(file.bytes).digest("hex"),
    createdAt: now,
  });
  await getDb().insert(activities).values({ id: newId(), enquiryId, userId: user.id, type: "ATTACHMENT_ADDED", note: `${file.kind ?? "Document"}: ${safeName}`, createdAt: now });
  await getDb().update(enquiries).set({ lastActivityAt: now, updatedAt: now }).where(eq(enquiries.id, enquiryId));
  await writeAudit({ userId: user.id, action: "attachment.add", entityType: "attachment", entityId: id, after: { enquiryId, safeName, size: file.bytes.length } });
  return { id, fileName: safeName, mimeType: file.type, sizeBytes: file.bytes.length, kind: file.kind ?? "Supporting Document", createdAt: now };
}

export async function getAttachment(user: CurrentUser, attachmentId: string) {
  const row = await getDb().query.attachments.findFirst({ where: eq(attachments.id, attachmentId) });
  if (!row) throw new HttpError(404, "Attachment not found");
  const e = await loadEnquiryForAccess(row.enquiryId);
  if (!e || !canViewEnquiry(user, e)) throw new HttpError(404, "Attachment not found");
  return row;
}

export async function removeAttachment(user: CurrentUser, attachmentId: string) {
  const row = await getAttachment(user, attachmentId);
  const e = (await loadEnquiryForAccess(row.enquiryId))!;
  if (!canEditEnquiry(user, e)) throw new AuthzError();
  if (user.role === "SALES_EXECUTIVE" && row.uploadedById !== user.id) throw new AuthzError("You can only remove documents you uploaded");
  await getDb().delete(attachments).where(and(eq(attachments.id, attachmentId)));
  await getDb().insert(activities).values({ id: newId(), enquiryId: row.enquiryId, userId: user.id, type: "ATTACHMENT_REMOVED", note: row.fileName, createdAt: nowIso() });
  await writeAudit({ userId: user.id, action: "attachment.remove", entityType: "attachment", entityId: attachmentId, before: { fileName: row.fileName, enquiryId: row.enquiryId } });
}
