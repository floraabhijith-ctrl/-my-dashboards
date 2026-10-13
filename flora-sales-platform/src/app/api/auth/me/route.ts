import { handle, json, requireUser } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json({ user });
});
