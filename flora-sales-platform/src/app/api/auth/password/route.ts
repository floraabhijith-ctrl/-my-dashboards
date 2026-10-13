import { z } from "zod";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { changeOwnPassword } from "@/lib/admin/users";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) });

export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const body = schema.parse(await readJson(req));
  await changeOwnPassword(user, body.currentPassword, body.newPassword);
  return json({ ok: true });
});
