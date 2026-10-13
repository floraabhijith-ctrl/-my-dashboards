"use client";
import Link from "next/link";
import { aed, pct } from "@/lib/client/format";
import { Card, Empty } from "@/components/ui";
import { GroupedBars } from "@/components/charts";
import { DashboardFrame } from "./useDashboard";

export function SalespeoplePage() {
  return (
    <DashboardFrame title="Salesperson Performance" subtitle="Click a salesperson to drill into their enquiries (restricted to your authorised scope).">
      {(d) => (
        <>
          <Card title="Confirmed revenue and pipeline by salesperson">{d.salespeople.length ? <GroupedBars money data={d.salespeople} nameKey="ownerName" series={[{ key: "confirmedRevenue", label: "Confirmed revenue", color: "#1F7A4D" }, { key: "pipelineRevenue", label: "Pipeline" }]} /> : <Empty title="No data." />}</Card>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Salesperson</th><th>Properties</th><th className="text-right">Total enquiries</th><th className="text-right">Quotations</th><th className="text-right">Confirmed</th><th className="text-right">Conversion</th><th className="text-right">Potential revenue</th><th className="text-right">Confirmed revenue</th><th className="text-right">Follow-ups done</th><th className="text-right">Overdue</th><th className="text-right">Lost</th></tr></thead>
              <tbody>
                {d.salespeople.map((s) => (
                  <tr key={s.ownerId}>
                    <td><Link href={`/management/enquiries?ownerId=${s.ownerId}`} className="font-medium text-plum-600 hover:underline">{s.ownerName}</Link></td>
                    <td>{s.properties}</td>
                    <td className="text-right tabular-nums">{s.enquiries}</td>
                    <td className="text-right tabular-nums">{s.quotations}</td>
                    <td className="text-right tabular-nums">{s.confirmed}</td>
                    <td className="text-right tabular-nums">{pct(s.conversionBps)}</td>
                    <td className="text-right tabular-nums">{aed(s.pipelineRevenue)}</td>
                    <td className="text-right tabular-nums font-medium">{aed(s.confirmedRevenue)}</td>
                    <td className="text-right tabular-nums">{s.followUpsCompleted}</td>
                    <td className={`text-right tabular-nums ${s.overdueFollowUps ? "text-danger font-medium" : ""}`}>{s.overdueFollowUps}</td>
                    <td className="text-right tabular-nums">{s.lost}</td>
                  </tr>
                ))}
                {!d.salespeople.length && <tr><td colSpan={11} className="text-center text-muted">No enquiries in scope.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DashboardFrame>
  );
}
