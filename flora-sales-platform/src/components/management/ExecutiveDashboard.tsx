"use client";
import Link from "next/link";
import { Download } from "lucide-react";
import { qs } from "@/lib/client/api";
import { aed, pct, fmtMonth } from "@/lib/client/format";
import { Card, Empty, Kpi } from "@/components/ui";
import { MonthlyBars, Donut, Funnel, GroupedBars, TrendLines, CategoryBars } from "@/components/charts";
import { DashboardFrame } from "./useDashboard";
import { SlimTable } from "./SlimTable";

export function ExecutiveDashboard() {
  return (
    <DashboardFrame title="Executive Dashboard" subtitle="Consolidated commercial view across all authorised properties and salespeople. Filters apply to every KPI, chart and table." actions={(f) => <a className="btn-secondary" href={`/api/exports/enquiries${qs(f)}`}><Download className="h-4 w-4" /> Export CSV</a>}>
      {(d) => {
        const k = d.kpis;
        const sourceMonthly = d.trends.series.map((s) => ({ month: s.month, ...s.bySource }));
        const sources = [...new Set(d.bySource.map((s) => s.source))];
        const propMonthly = d.trends.series.map((s) => ({ month: s.month, ...s.byProperty }));
        const props = d.byProperty.map((p) => p.propertyCode);
        const hasYoy = d.trends.yoy.some((y) => y.previousYear !== null);
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Total enquiries" value={k.totalEnquiries} hint="In filtered scope" />
              <Kpi label="New enquiries" value={k.newEnquiries} />
              <Kpi label="Active enquiries" value={k.activeEnquiries} />
              <Kpi label="Qualified opportunities" value={k.qualified} />
              <Kpi label="Quotations sent" value={k.quotationsSent} />
              <Kpi label="Confirmed bookings" value={k.confirmed} tone="success" />
              <Kpi label="Lost business" value={k.lost} hint={`${aed(k.lostRevenue, true)} value`} />
              <Kpi label="Lead conversion" value={pct(k.conversionBps)} hint={`Win rate ${pct(k.winRateBps)}`} />
              <Kpi label="Active pipeline revenue" value={aed(k.pipelineRevenue, true)} hint={`Weighted ${aed(k.weightedPipeline, true)}`} />
              <Kpi label="Confirmed revenue" value={aed(k.confirmedRevenue, true)} tone="success" />
              <Kpi label="Estimated room nights" value={k.pipelineRoomNights.toLocaleString()} hint={`${k.confirmedRoomNights.toLocaleString()} confirmed`} />
              <Kpi label="Overdue follow-ups" value={k.overdueFollowUps} tone={k.overdueFollowUps ? "danger" : "default"} hint={`${k.dueToday} due today · ${k.awaitingApproval} awaiting approval`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Enquiry volume by month" className="lg:col-span-2">{d.trends.series.length ? <MonthlyBars data={d.trends.series} series={[{ key: "enquiries", label: "Enquiries" }, { key: "quotations", label: "Quotations", color: "#AB96B5" }, { key: "confirmed", label: "Confirmed", color: "#1F7A4D" }]} /> : <Empty title="No enquiries in scope." />}</Card>
              <Card title="Short stay vs long stay"><Donut data={[{ name: "Short Stay", value: d.stayMix.shortStay }, { name: "Long Stay", value: d.stayMix.longStay }]} nameKey="name" valueKey="value" /></Card>
              <Card title="Year-over-year enquiry volume">{hasYoy ? <TrendLines data={d.trends.yoy} series={[{ key: "current", label: "This year" }, { key: "previousYear", label: "Previous year", color: "#AB96B5" }]} /> : <Empty title="Not enough history for a year-over-year comparison.">Comparison appears automatically once the same month exists in two years.</Empty>}</Card>
              <Card title="Enquiries by source per month">{sources.length ? <MonthlyBars stacked data={sourceMonthly} series={sources.map((s) => ({ key: s, label: s }))} /> : <Empty title="No data." />}</Card>
              <Card title="Property-wise enquiries per month">{props.length ? <MonthlyBars data={propMonthly} series={props.map((p) => ({ key: p, label: p }))} /> : <Empty title="No data." />}</Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Conversion funnel"><Funnel stages={d.funnel.stages} /><div className="mt-3 text-xs text-muted">Closed: {d.funnel.closed.confirmed} confirmed · {d.funnel.closed.lost} lost · {d.funnel.closed.cancelled} cancelled</div></Card>
              <Card title="Property performance">{d.byProperty.length ? <GroupedBars money data={d.byProperty} nameKey="propertyCode" series={[{ key: "pipelineRevenue", label: "Pipeline" }, { key: "confirmedRevenue", label: "Confirmed", color: "#1F7A4D" }]} /> : <Empty title="No data." />}</Card>
              <Card title="Enquiries by source"><CategoryBars data={d.bySource} nameKey="source" valueKey="enquiries" /></Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Salesperson leaderboard" actions={<Link href="/management/salespeople" className="text-xs text-plum-600 underline">Full view</Link>}>
                <div className="table-wrap"><table className="table"><thead><tr><th>Salesperson</th><th className="text-right">Enquiries</th><th className="text-right">Confirmed</th><th className="text-right">Conv.</th><th className="text-right">Confirmed rev.</th><th className="text-right">Overdue</th></tr></thead>
                  <tbody>{d.salespeople.slice(0, 8).map((s) => <tr key={s.ownerId}><td><Link className="text-plum-600 hover:underline" href={`/management/enquiries?ownerId=${s.ownerId}`}>{s.ownerName}</Link></td><td className="text-right tabular-nums">{s.enquiries}</td><td className="text-right tabular-nums">{s.confirmed}</td><td className="text-right tabular-nums">{pct(s.conversionBps)}</td><td className="text-right tabular-nums">{aed(s.confirmedRevenue)}</td><td className={`text-right tabular-nums ${s.overdueFollowUps ? "text-danger" : ""}`}>{s.overdueFollowUps}</td></tr>)}</tbody></table></div>
              </Card>
              <Card title="Forward outlook by stay month" actions={<Link href="/management/pipeline" className="text-xs text-plum-600 underline">Full view</Link>}>
                {d.outlook.length ? <MonthlyBars money stacked data={d.outlook.map((o) => ({ month: o.stayMonth, confirmed: o.confirmedRevenue, pipeline: o.pipelineRevenue }))} series={[{ key: "confirmed", label: "Confirmed", color: "#1F7A4D" }, { key: "pipeline", label: "Pipeline" }]} height={240} /> : <Empty title="No forward business." />}
                <div className="mt-2 text-xs text-muted">Stay month = arrival date, independent of when the enquiry was created. {d.outlook.length ? `Next: ${fmtMonth(d.outlook[0].stayMonth)}` : ""}</div>
              </Card>
            </div>

            <Card title="Enquiries requiring management attention" actions={<Link href="/management/negotiations" className="text-xs text-plum-600 underline">Negotiation tracker</Link>}>
              <SlimTable rows={d.negotiation.attention.slice(0, 10)} cols={["ref", "company", "property", "owner", "status", "proposed", "revised", "approved", "discount", "potential", "lastActivity"]} empty="No enquiries need intervention right now." />
            </Card>
          </>
        );
      }}
    </DashboardFrame>
  );
}
