"use client";
import { type ReactNode, useEffect } from "react";
import { X, Loader2, Info, AlertTriangle, CheckCircle2 } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-plum-700">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", actions, pearl = false }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; pearl?: boolean }) {
  return (
    <section className={`${pearl ? "card-pearl" : "card"} p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="section-title">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "success" | "warning" | "danger" }) {
  const toneCls = { default: "", success: "text-success", warning: "text-warning", danger: "text-danger" }[tone];
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`kpi-value mt-1 ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  "New Enquiry": "bg-info-bg text-info",
  Contacted: "bg-plum-100 text-plum-700",
  Qualified: "bg-plum-100 text-plum-700",
  "Quotation Sent": "bg-warning-bg text-warning",
  Negotiation: "bg-warning-bg text-warning",
  "Awaiting Client": "bg-warning-bg text-warning",
  "Awaiting Internal Approval": "bg-danger-bg text-danger",
  Confirmed: "bg-success-bg text-success",
  Lost: "bg-gray-200 text-gray-700",
  Cancelled: "bg-gray-200 text-gray-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STATUS_TONES[status] ?? "bg-pearl text-plum-700"}`}>{status}</span>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" | "plum" }) {
  const cls = {
    neutral: "bg-pearl text-plum-700",
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    danger: "bg-danger-bg text-danger",
    info: "bg-info-bg text-info",
    plum: "bg-plum-600 text-white",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge tone={priority === "High" ? "danger" : priority === "Medium" ? "warning" : "neutral"}>{priority}</Badge>;
}

export function Alert({ tone = "info", children, title }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode; title?: string }) {
  const cfg = {
    info: ["bg-info-bg text-info", Info],
    warning: ["bg-warning-bg text-warning", AlertTriangle],
    danger: ["bg-danger-bg text-danger", AlertTriangle],
    success: ["bg-success-bg text-success", CheckCircle2],
  }[tone] as [string, typeof Info];
  const Icon = cfg[1];
  return (
    <div className={`flex gap-2 rounded-lg px-3 py-2.5 text-sm ${cfg[0]}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <div className="font-medium">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted justify-center">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-ivory px-4 py-8 text-center">
      <div className="text-sm font-medium text-plum-700">{title}</div>
      {children && <div className="mt-1 text-xs text-muted">{children}</div>}
    </div>
  );
}

export function Field({ label, error, children, hint, required, className = "" }: { label: string; error?: string; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  return (
    <div className={className}>
      <label className="label">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-plum-900/50 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-[var(--radius-card)] p-5`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title">{title}</h2>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DemoBanner({ count }: { count: number }) {
  if (!count) return null;
  return (
    <div className="mb-4 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
      <strong>Demonstration data:</strong> {count} record{count === 1 ? "" : "s"} shown are fictional sample enquiries (flagged “Demo”). They are not real business results. An administrator can hide them in Settings.
    </div>
  );
}
