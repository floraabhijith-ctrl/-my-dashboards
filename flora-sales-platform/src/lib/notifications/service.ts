import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { notifications, users, type NotificationType } from "../db/schema";
import { newId } from "../ids";
import { nowIso } from "../dates";
import { sendEmail } from "./email";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  enquiryId?: string | null;
  title: string;
  body: string;
  /** Stable key - a second call with the same key is a no-op (prevents duplicate reminders). */
  dedupeKey: string;
  link?: string;
}

/**
 * Creates an in-app notification and (if the user opted in) sends an e-mail.
 * Returns false when the dedupe key already exists.
 */
export async function notify(input: NotifyInput): Promise<boolean> {
  const db = getDb();
  const existing = await db.query.notifications.findFirst({ where: eq(notifications.dedupeKey, input.dedupeKey) });
  if (existing) return false;

  const id = newId();
  try {
    await db.insert(notifications).values({
      id,
      userId: input.userId,
      type: input.type,
      enquiryId: input.enquiryId ?? null,
      title: input.title,
      body: input.body,
      dedupeKey: input.dedupeKey,
      emailStatus: "PENDING",
    });
  } catch {
    // Unique constraint race: another process inserted the same key.
    return false;
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
  if (!user || !user.isActive || !user.notifyByEmail) {
    await db.update(notifications).set({ emailStatus: "SKIPPED" }).where(eq(notifications.id, id));
    return true;
  }
  const base = process.env.APP_URL ?? "";
  const link = input.link ? `${base}${input.link}` : base;
  const result = await sendEmail({
    to: user.email,
    subject: `[Flora Sales] ${input.title}`,
    text: `${input.body}\n\n${link}`,
    html: `<p>${escapeHtml(input.body)}</p><p><a href="${link}">Open in the Sales Enquiry Platform</a></p>`,
  });
  await db
    .update(notifications)
    .set({ emailStatus: result.ok ? (result.skipped ? "SKIPPED" : "SENT") : "FAILED", emailError: result.error ?? null })
    .where(eq(notifications.id, id));
  return true;
}

export async function listNotifications(userId: string, limit = 30) {
  return getDb().query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
}

export async function unreadCount(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}

export async function markRead(userId: string, ids: string[] | "all") {
  const db = getDb();
  if (ids === "all") {
    await db.update(notifications).set({ readAt: nowIso() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return;
  }
  for (const id of ids) {
    await db.update(notifications).set({ readAt: nowIso() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
