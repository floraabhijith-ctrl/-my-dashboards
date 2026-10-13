"use client";
import { Download } from "lucide-react";
import { qs } from "@/lib/client/api";
import { aed, pct, fmtMonth } from "@/lib/client/format";
import { Card } from "@/components/ui";
import { DashboardFrame } from "./useDashboard";

export function ReportsPage() {
  return (
    <DashboardFrame title="Reports" subtitle="Summary tables for the filtered scope, with CSV export of the underlying enquiry records (management users only)." actions={(f) => <a className="btn-primary" href={`/api/exports/enquiries${qs(f)}`}><Download className="h-4 w-4" /> Export enquiries (CSV)</a>}>
      {(d) => (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Monthly summary (by enquiry month)">
            <div className="table-wrap"><table className="table"><thead><tr><th>Month</th><th className="text-right">Enquiries</th><th className="text-right">Quotations</th><th className="text-right">Confirmed</th><th className="text-right">Lost</th><th className="text-right">Conv.</th><th className="text-right">Confirmed rev.</th><th className="text-right">Pipeline</th></tr></thead>
              <tbody>{d.trends.series.map((s) => <tr key={s.month}><td>{fmtMonth(s.month)}</td><td className="text-right tabular-nums">{s.enquiries}</td><td className="text-right tabular-nums">{s.quotations}</td><td className="text-right tabular-nums">{s.confirmed}</td><td className="text-right tabular-nums">{s.lost}</td><td className="text-right tabular-nums">{pct(s.conversionBps)}</td><td className="text-right tabular-nums">{aed(s.confirmedRevenue)}</td><td className="text-right tabular-nums">{aed(s.pipelineRevenue)}</td></tr>)}</tbody></table></div>
          </Card>
          <Card title="By market segment">
            <div className="table-wrap"><table className="table"><thead><tr><th>Segment</th><th className="text-right">Enquiries</th><th className="text-right">Confirmed</th><th className="text-right">Conv.</th><th className="text-right">Confirmed rev.</th><th className="text-right">Pipeline</th><th className="text-right">Room nights</th></tr></thead>
              <tbody>{d.bySegment.map((s) => <tr key={s.segment}><td>{s.segment}</td><td className="text-right tabular-nums">{s.enquiries}</td><td className="text-right tabular-nums">{s.confirmed}</td><td className="text-right tabular-nums">{pct(s.conversionBps)}</td><td className="text-right tabular-nums">{aed(s.confirmedRevenue)}</td><td className="text-right tabular-nums">{aed(s.pipelineRevenue)}</td><td className="text-right tabular-nums">{s.roomNights.toLocaleString()}</td></tr>)}</tbody></table></div>
          </Card>
          <Card title="By enquiry source">
            <div className="table-wrap"><table className="table"><thead><tr><th>Source</th><th className="text-right">Enquiries</th><th className="text-right">Confirmed</th><th className="text-right">Conv.</th><th className="text-right">Confirmed rev.</th><th className="text-right">Pipeline</th></tr></thead>
              <tbody>{d.bySource.map((s) => <tr key={s.source}><td>{s.source}</td><td className="text-right tabular-nums">{s.enquiries}</td><td className="text-right tabular-nums">{s.confirmed}</td><td className="text-right tabular-nums">{pct(s.conversionBps)}</td><td className="text-right tabular-nums">{aed(s.confirmedRevenue)}</td><td className="text-right tabular-nums">{aed(s.pipelineRevenue)}</td></tr>)}</tbody></table></div>
          </Card>
          <Card title="Status mix">
            <div className="table-wrap"><table className="table"><thead><tr><th>Status</th><th className="text-right">Enquiries</th><th className="text-right">Share</th></tr></thead>
              <tbody>{d.funnel.statusMix.map((s) => <tr key={s.status}><td>{s.status}</td><td className="text-right tabular-nums">{s.count}</td><td className="text-right tabular-nums">{d.kpis.totalEnquiries ? `${((s.count / d.kpis.totalEnquiries) * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table></div>
          </Card>
        </div>
      )}
    </DashboardFrame>
  );
}
