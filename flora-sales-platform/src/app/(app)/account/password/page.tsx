"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Alert, Card, Field, PageHeader } from "@/components/ui";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) return setError("New passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/password", { method: "POST", body: { currentPassword, newPassword } });
      setOk(true);
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-lg">
      {params.get("first") && <div className="mb-4"><Alert tone="warning">Please replace your temporary password before continuing.</Alert></div>}
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {ok && <Alert tone="success">Password updated. Redirecting…</Alert>}
        <Field label="Current password" required><input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required /></Field>
        <Field label="New password" required hint="At least 10 characters with upper-case, lower-case and a number."><input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} required /></Field>
        <Field label="Confirm new password" required><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
      </form>
    </Card>
  );
}

export default function PasswordPage() {
  return (
    <>
      <PageHeader title="Change password" subtitle="Your sessions on other devices will remain active until they expire." />
      <Suspense fallback={null}><Form /></Suspense>
    </>
  );
}
