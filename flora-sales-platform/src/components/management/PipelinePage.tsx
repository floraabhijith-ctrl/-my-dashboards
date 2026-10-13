"use client";
import { aed, fmtMonth } from "@/lib/client/format";
import { Card, Empty, Kpi } from "@/components/ui";
import { MonthlyBars, CategoryBars } from "@/components/charts";
import { DashboardFrame } from "./useDashboard";

export function PipelinePage() {
  return (
    <DashboardFrame title="Revenue Pipeline & Forward Outlook" subtitle="Expected room nights and revenue by future stay month. Enquiry creation month is never mixed with stay month; each enquiry counts once at its current effective rate.">
      {(d) => {
        const k = d.kpis;
        const byStatus = d.funnel.stages.filter((s) => s.stage !== "Confirmed").map((s) => ({ stage: s.stage, revenue: s.revenue }));
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Active pipeline" value={aed(k.pipelineRevenue, true)} hint={`${k.activeEnquiries} active enquiries`} />
              <Kpi label="Probability-weighted" value={aed(k.weightedPipeline, true)} />
              <Kpi label="Pipeline room nights" value={k.pipelineRoomNights.toLocaleString()} />
              <Kpi label="Confirmed revenue" value={aed(k.confirmedRevenue, true)} tone="success" hint={`${k.confirmedRoomNights.toLocaleString()} room nights`} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Revenue by stay month">{d.outlook.length ? <MonthlyBars money stacked data={d.outlook.map((o) => ({ month: o.stayMonth, confirmed: o.confirmedRevenue, pipeline: o.pipelineRevenue }))} series={[{ key: "confirmed", label: "Confirmed", color: "#1F7A4D" }, { key: "pipeline", label: "Active pipeline" }]} /> : <Empty title="No forward business." />}</Card>
              <Card title="Room nights by stay month">{d.outlook.length ? <MonthlyBars stacked data={d.outlook.map((o) => ({ month: o.stayMonth, confirmed: o.confirmedRoomNights, pipeline: o.pipelineRoomNights }))} series={[{ key: "confirmed", label: "Confirmed", color: "#1F7A4D" }, { key: "pipeline", label: "Pipeline" }]} /> : <Empty title="No forward business." />}</Card>
              <Card title="Active pipeline value by stage"><CategoryBars money data={byStatus} nameKey="stage" valueKey="revenue" /></Card>
              <Card title="Pipeline by segment"><CategoryBars money data={d.bySegment} nameKey="segment" valueKey="pipelineRevenue" /></Card>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Stay month</th><th className="text-right">Enquiries</th><th className="text-right">Confirmed room nights</th><th className="text-right">Pipeline room nights</th><th className="text-right">Confirmed revenue</th><th className="text-right">Pipeline revenue</th><th className="text-right">Weighted pipeline</th>{d.byProperty.map((p) => <th key={p.propertyCode} className="text-right">{p.propertyCode} rev.</th>)}</tr></thead>
                <tbody>
                  {d.outlook.map((o) => (
                    <tr key={o.stayMonth}><td className="font-medium">{fmtMonth(o.stayMonth)}</td><td className="text-right tabular-nums">{o.enquiries}</td><td className="text-right tabular-nums">{o.confirmedRoomNights.toLocaleString()}</td><td className="text-right tabular-nums">{o.pipelineRoomNights.toLocaleString()}</td><td className="text-right tabular-nums font-medium">{aed(o.confirmedRevenue)}</td><td className="text-right tabular-nums">{aed(o.pipelineRevenue)}</td><td className="text-right tabular-nums">{aed(o.weightedPipelineRevenue)}</td>{d.byProperty.map((p) => <td key={p.propertyCode} className="text-right tabular-nums">{aed(o.byProperty[p.propertyCode]?.revenue ?? 0)}</td>)}</tr>
                  ))}
                  {!d.outlook.length && <tr><td colSpan={7} className="text-center text-muted">No active or confirmed enquiries in scope.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        );
      }}
    </DashboardFrame>
  );
}
