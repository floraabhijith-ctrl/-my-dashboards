"use client";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { useFetch } from "@/lib/client/hooks";
import type { SlimEnquiry } from "@/lib/client/types";
import { aed, fmtDate, fmtDateTime } from "@/lib/client/format";
import { Alert, Card, Empty, Kpi, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { MonthlyBars } from "@/components/charts";

interface Workspace {
  today: string;
  kpis: Record<string, number>;
  upcoming: SlimEnquiry[];
  recent: SlimEnquiry[];
  trends: { series: { month: string; enquiries: number; confirmed: number; lost: number }[] };
}

export function MyDashboard({ userName }: { userName: string }) {
  const { data, error, loading } = useFetch<Workspace>("/api/analytics/workspace");
  if (loading && !data) return <Spinner />;
  if (error || !data) return <Alert tone="danger">{error ?? "Unable to load workspace."}</Alert>;
  const k = data.kpis;
  return (
    <>
      <PageHeader title={`Welcome, ${userName.split(" ")[0]}`} subtitle="Your personal sales workspace. Figures cover only the enquiries assigned to you." actions={<Link href="/enquiries/new" className="btn-primary"><FilePlus2 className="h-4 w-4" /> New enquiry</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="My total enquiries" value={k.totalEnquiries} />
        <Kpi label="New enquiries" value={k.newEnquiries} />
        <Kpi label="Quotations sent" value={k.quotationsSent} />
        <Kpi label="Negotiations in progress" value={k.negotiations} />
        <Kpi label="Pending client responses" value={k.awaitingClient} />
        <Kpi label="Confirmed" value={k.confirmed} tone="success" />
        <Kpi label="Lost" value={k.lost} />
        <Kpi label="Overdue follow-ups" value={k.overdueFollowUps} tone={k.overdueFollowUps ? "danger" : "default"} hint={k.dueToday ? `${k.dueToday} due today` : undefined} />
        <Kpi label="Estimated pipeline revenue" value={aed(k.pipelineRevenue, true)} hint={`Weighted ${aed(k.weightedPipeline, true)}`} />
        <Kpi label="Confirmed revenue" value={aed(k.confirmedRevenue, true)} tone="success" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Follow-ups due (next 7 days)" className="lg:col-span-1">
          {data.upcoming.length === 0 ? <Empty title="Nothing due this week." /> : (
            <ul className="divide-y divide-line text-sm">
              {data.upcoming.map((e) => (
                <li key={e.id} className="py-2">
                  <div className="flex items-center justify-between gap-2"><Link href={`/enquiries/${e.id}`} className="font-medium text-plum-700 hover:underline truncate">{e.companyName}</Link><span className={`text-xs whitespace-nowrap ${e.nextFollowUpAt! < data.today ? "text-danger font-medium" : e.nextFollowUpAt === data.today ? "text-warning font-medium" : "text-muted"}`}>{fmtDate(e.nextFollowUpAt)}</span></div>
                  <div className="text-xs text-muted truncate">{e.enquiryRef} · {e.nextAction ?? "No next action recorded"}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Monthly enquiries" className="lg:col-span-2">
          {data.trends.series.length ? <MonthlyBars data={data.trends.series} series={[{ key: "enquiries", label: "Enquiries" }, { key: "confirmed", label: "Confirmed", color: "#1F7A4D" }, { key: "lost", label: "Lost", color: "#C9B8CF" }]} height={220} /> : <Empty title="No enquiries yet." />}
        </Card>
      </div>
      <Card title="Recently active" className="mt-4">
        {data.recent.length === 0 ? <Empty title="No enquiries yet.">Register your first enquiry to get started.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Enquiry</th><th>Company</th><th>Property</th><th>Arrival</th><th className="text-right">Potential</th><th>Status</th><th>Last activity</th></tr></thead>
              <tbody>
                {data.recent.map((e) => (
                  <tr key={e.id}><td><Link className="font-medium text-plum-600 hover:underline" href={`/enquiries/${e.id}`}>{e.enquiryRef}</Link></td><td>{e.companyName}</td><td>{e.propertyCode}</td><td>{fmtDate(e.arrivalDate)}</td><td className="text-right tabular-nums">{aed(e.potentialRevenue)}</td><td><StatusBadge status={e.status} /></td><td>{fmtDateTime(e.lastActivityAt)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
