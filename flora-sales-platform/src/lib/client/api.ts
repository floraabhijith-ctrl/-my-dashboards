"use client";

export class ApiError extends Error {
  status: number;
  details: { path: string; message: string }[] | null;
  constructor(status: number, message: string, details: { path: string; message: string }[] | null = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details ?? []) if (!out[d.path]) out[d.path] = d.message;
    return out;
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(path, { method: init.method ?? "GET", headers, body, credentials: "same-origin", cache: "no-store" });
  if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; details?: { path: string; message: string }[] | null };
    throw new ApiError(res.status, d.error ?? `Request failed (${res.status})`, Array.isArray(d.details) ? d.details : null);
  }
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
