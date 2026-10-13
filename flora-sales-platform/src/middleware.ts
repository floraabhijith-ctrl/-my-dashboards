import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/auth/login", "/api/health", "/api/cron"];

/**
 * Cheap edge check: redirects page requests without a session cookie to /login.
 * Real authorisation is enforced server-side on every data operation.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next") || pathname === "/favicon.ico") return NextResponse.next();
  const hasSession = Boolean(req.cookies.get("flora_session")?.value);
  if (!hasSession) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|brand).*)"] };
