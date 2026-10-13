import { NextResponse } from "next/server";
import { destroySessionByToken, tokenFromRequest, SESSION_COOKIE } from "@/lib/auth/session";
import { handle } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const token = tokenFromRequest(req);
  if (token) await destroySessionByToken(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
});
