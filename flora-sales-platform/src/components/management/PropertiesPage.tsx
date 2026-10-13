"use client";
import Link from "next/link";
import { aed, pct } from "@/lib/client/format";
import { Card, Empty } from "@/components/ui";
import { GroupedBars, MonthlyBars } from "@/components/charts";
import { DashboardFrame } from "./useDashboard";

export function PropertiesPage() {
  return (
    <DashboardFrame title="Property Performance" subtitle="Compare Flora Creek, Flora Inn and Flora Al Barsha across volume, pipeline, confirmed revenue and conversion.">
      {(d) => {
        const propMonthly = d.trends.series.map((s) => ({ month: s.month, ...s.byProperty }));
        const codes = d.byProperty.map((p) => p.propertyCode);
        return (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Enquiry volume">{d.byProperty.length ? <GroupedBars data={d.byProperty} nameKey="propertyCode" series={[{ key: "enquiries", label: "Enquiries" }, { key: "quotations", label: "Quotations", color: "#AB96B5" }, { key: "confirmed", label: "Confirmed", color: "#1F7A4D" }]} /> : <Empty title="No data." />}</Card>
              <Card title="Revenue">{d.byProperty.length ? <GroupedBars money data={d.byProperty} nameKey="propertyCode" series={[{ key: "pipelineRevenue", label: "Pipeline" }, { key: "confirmedRevenue", label: "Confirmed", color: "#1F7A4D" }]} /> : <Empty title="No data." />}</Card>
              <Card title="Monthly enquiries by property" className="lg:col-span-2">{codes.length ? <MonthlyBars data={propMonthly} series={codes.map((c) => ({ key: c, label: c }))} /> : <Empty title="No data." />}</Card>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Property</th><th className="text-right">Enquiries</th><th className="text-right">Active</th><th className="text-right">Quotations</th><th className="text-right">Confirmed</th><th className="text-right">Lost</th><th className="text-right">Conversion</th><th className="text-right">Pipeline value</th><th className="text-right">Confirmed revenue</th><th className="text-right">Room nights</th><th className="text-right">Short / Long</th></tr></thead>
                <tbody>
                  {d.byProperty.map((p) => (
                    <tr key={p.propertyId}>
                      <td><Link href={`/management/enquiries?propertyId=${p.propertyId}`} className="font-medium text-plum-600 hover:underline">{p.propertyName}</Link></td>
                      <td className="text-right tabular-nums">{p.enquiries}</td><td className="text-right tabular-nums">{p.active}</td><td className="text-right tabular-nums">{p.quotations}</td><td className="text-right tabular-nums">{p.confirmed}</td><td className="text-right tabular-nums">{p.lost}</td>
                      <td className="text-right tabular-nums">{pct(p.conversionBps)}</td><td className="text-right tabular-nums">{aed(p.pipelineRevenue)}</td><td className="text-right tabular-nums font-medium">{aed(p.confirmedRevenue)}</td><td className="text-right tabular-nums">{p.roomNights.toLocaleString()}</td><td className="text-right tabular-nums">{p.shortStay} / {p.longStay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );
      }}
    </DashboardFrame>
  );
}
