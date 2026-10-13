"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { qs } from "@/lib/client/api";
import { useFetch } from "@/lib/client/hooks";
import type { EnquiryRow } from "@/lib/client/types";
import { monthDubai, todayDubai, fmtMonth } from "@/lib/client/format";
import { Alert, Card, PageHeader, Spinner, StatusBadge } from "@/components/ui";

export function FollowUpCalendar() {
  const [month, setMonth] = useState(monthDubai());
  const { data, error, loading } = useFetch<{ items: EnquiryRow[] }>(`/api/enquiries${qs({ status: "__active", followUpDue: "any", pageSize: 500 })}`);
  const today = todayDubai();
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const startDow = (first.getUTCDay() + 6) % 7; // Monday first
  const byDay = useMemo(() => {
    const map = new Map<string, EnquiryRow[]>();
    for (const e of data?.items ?? []) if (e.nextFollowUpAt?.startsWith(month)) map.set(e.nextFollowUpAt, [...(map.get(e.nextFollowUpAt) ?? []), e]);
    return map;
  }, [data, month]);
  const overdue = (data?.items ?? []).filter((e) => e.nextFollowUpAt && e.nextFollowUpAt < today);
  const shift = (d: number) => {
    const n = new Date(Date.UTC(y, m - 1 + d, 1));
    setMonth(n.toISOString().slice(0, 7));
  };
  const cells = Array.from({ length: startDow + daysInMonth }, (_, i) => (i < startDow ? null : i - startDow + 1));
  return (
    <>
      <PageHeader title="Follow-up Calendar" subtitle="Scheduled next follow-up dates for your active enquiries." actions={<div className="flex items-center gap-2"><button className="btn-secondary p-2" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button><div className="min-w-32 text-center text-sm font-medium text-plum-700">{fmtMonth(month)}</div><button className="btn-secondary p-2" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button><button className="btn-ghost text-xs" onClick={() => setMonth(monthDubai())}>Today</button></div>} />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading && !data ? <Spinner /> : (
        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="lg:col-span-3 p-2 sm:p-3">
            <div className="grid grid-cols-7 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-px bg-line rounded-lg overflow-hidden">
              {cells.map((day, i) => {
                const key = day ? `${month}-${String(day).padStart(2, "0")}` : "";
                const items = key ? byDay.get(key) ?? [] : [];
                const isToday = key === today;
                return (
                  <div key={i} className={`min-h-24 bg-white p-1.5 ${day ? "" : "bg-ivory"} ${isToday ? "ring-2 ring-inset ring-plum-400" : ""}`}>
                    {day && <div className={`text-xs font-medium ${key < today ? "text-muted" : "text-plum-700"}`}>{day}</div>}
                    <div className="mt-1 space-y-1">
                      {items.slice(0, 3).map((e) => (
                        <Link key={e.id} href={`/enquiries/${e.id}`} className={`block truncate rounded px-1 py-0.5 text-[11px] ${key < today ? "bg-danger-bg text-danger" : "bg-plum-100 text-plum-700"}`} title={`${e.companyName} · ${e.nextAction ?? ""}`}>{e.companyName}</Link>
                      ))}
                      {items.length > 3 && <div className="text-[10px] text-muted">+{items.length - 3} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title={`Overdue (${overdue.length})`}>
            {overdue.length === 0 ? <p className="text-sm text-muted">No overdue follow-ups.</p> : (
              <ul className="space-y-2 text-sm">
                {overdue.sort((a, b) => (a.nextFollowUpAt! < b.nextFollowUpAt! ? -1 : 1)).map((e) => (
                  <li key={e.id} className="rounded-lg border border-danger/20 bg-danger-bg/40 px-2 py-1.5">
                    <Link href={`/enquiries/${e.id}`} className="font-medium text-plum-700 hover:underline">{e.companyName}</Link>
                    <div className="flex items-center justify-between text-xs text-muted"><span>{e.enquiryRef} · due {e.nextFollowUpAt}</span><StatusBadge status={e.status} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
