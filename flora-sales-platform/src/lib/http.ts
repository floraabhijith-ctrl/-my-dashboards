import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthzError } from "./authz";
import { getUserFromRequest, type CurrentUser } from "./auth/session";

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, details: err.details ?? null }, { status: err.status });
  }
  if (err instanceof AuthzError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json({ error: "Validation failed", details: issues }, { status: 422 });
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: "An unexpected error occurred. Please try again." }, { status: 500 });
}

/** Resolve the authenticated user for a route handler or respond 401. */
export async function requireUser(req: Request): Promise<CurrentUser> {
  const user = await getUserFromRequest(req);
  if (!user) throw new HttpError(401, "Authentication required");
  return user;
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

export function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip");
}

/** Wraps a handler with uniform error handling. */
export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
