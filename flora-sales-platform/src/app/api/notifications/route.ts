import { z } from "zod";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { listNotifications, markRead, unreadCount } from "@/lib/notifications/service";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const [items, unread] = await Promise.all([listNotifications(user.id), unreadCount(user.id)]);
  return json({ notifications: items, unread });
});

export const PATCH = handle(async (req: Request) => {
  const user = await requireUser(req);
  const body = z.object({ ids: z.union([z.array(z.string()), z.literal("all")]) }).parse(await readJson(req));
  await markRead(user.id, body.ids);
  return json({ ok: true });
});
