"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/client/api";
import { Alert } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: { role: string; mustChangePassword: boolean } }>("/api/auth/login", { method: "POST", body: { email, password } });
      const next = params.get("next");
      if (res.user.mustChangePassword) router.replace("/account/password?first=1");
      else if (next && next.startsWith("/") && !next.startsWith("//")) router.replace(next);
      else router.replace(res.user.role === "SALES_EXECUTIVE" ? "/dashboard" : "/management");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <div>
        <label className="label" htmlFor="email">Work e-mail</label>
        <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button className="btn-primary w-full" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-xs text-muted">Access is restricted to authorised Flora Hospitality sales and management users.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-plum-600 text-white p-10">
        <div className="text-sm font-medium tracking-[0.3em] uppercase text-plum-200">Flora Hospitality</div>
        <div>
          <h1 className="text-4xl font-light leading-tight">Sales Enquiry<br /><span className="font-semibold">Management Platform</span></h1>
          <p className="mt-4 max-w-md text-plum-100/90">One secure workspace for every enquiry, negotiation and follow-up across Flora Creek, Flora Inn and Flora Al Barsha.</p>
        </div>
        <div className="text-xs text-plum-200">Dubai · All times shown in Asia/Dubai</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="card w-full max-w-md p-8">
          <div className="mb-6 lg:hidden text-xs font-medium tracking-[0.3em] uppercase text-plum-500">Flora Hospitality</div>
          <h2 className="text-xl font-semibold text-plum-700">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-muted">Use your individual account. Do not share credentials.</p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
