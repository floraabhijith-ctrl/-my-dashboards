"use client";
import { Card, Kpi } from "@/components/ui";
import { DashboardFrame } from "./useDashboard";
import { SlimTable } from "./SlimTable";

export function FollowUpsPage() {
  return (
    <DashboardFrame title="Follow-up Monitoring" subtitle="Active enquiries only. Inactivity and high-value thresholds are configured by the administrator in Settings.">
      {(d) => {
        const f = d.followUps;
        const t = f.thresholds;
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
              <Kpi label="Due today" value={f.dueToday.length} tone={f.dueToday.length ? "warning" : "default"} />
              <Kpi label="Overdue" value={f.overdue.length} tone={f.overdue.length ? "danger" : "default"} />
              <Kpi label="Due next 7 days" value={f.dueThisWeek.length} />
              <Kpi label={`No activity ${t.warningDays}+ days`} value={f.inactiveWarning.length} />
              <Kpi label={`No activity ${t.criticalDays}+ days`} value={f.inactiveCritical.length} tone={f.inactiveCritical.length ? "danger" : "default"} />
              <Kpi label="Quotations awaiting response" value={f.quotationsAwaiting.length} hint={`${t.quotationDays}+ days`} />
              <Kpi label="High-value, no recent activity" value={f.highValueStale.length} tone={f.highValueStale.length ? "danger" : "default"} hint={`≥ AED ${t.highValueAed.toLocaleString()}`} />
            </div>
            <Card title={`Overdue follow-ups (${f.overdue.length})`}><SlimTable rows={f.overdue} cols={["ref", "company", "property", "owner", "status", "nextFollowUp", "nextAction", "potential", "lastActivity"]} empty="No overdue follow-ups." /></Card>
            <Card title={`Due today (${f.dueToday.length})`}><SlimTable rows={f.dueToday} cols={["ref", "company", "property", "owner", "status", "nextAction", "potential"]} empty="Nothing due today." /></Card>
            <Card title={`High-value enquiries without recent activity (${f.highValueStale.length})`}><SlimTable rows={f.highValueStale} cols={["ref", "company", "property", "owner", "status", "potential", "probability", "lastActivity", "nextFollowUp"]} empty="All high-value opportunities are active." /></Card>
            <Card title={`Quotations awaiting client response (${f.quotationsAwaiting.length})`}><SlimTable rows={f.quotationsAwaiting} cols={["ref", "company", "property", "owner", "status", "proposed", "revised", "potential", "lastActivity", "nextFollowUp"]} empty="No quotations are waiting." /></Card>
            <Card title={`No activity for ${t.criticalDays}+ days (${f.inactiveCritical.length})`}><SlimTable rows={f.inactiveCritical} cols={["ref", "company", "property", "owner", "status", "potential", "lastActivity", "nextFollowUp"]} empty="None." /></Card>
            <Card title={`No activity for ${t.warningDays}+ days (${f.inactiveWarning.length})`}><SlimTable rows={f.inactiveWarning} cols={["ref", "company", "property", "owner", "status", "potential", "lastActivity", "nextFollowUp"]} empty="None." /></Card>
          </>
        );
      }}
    </DashboardFrame>
  );
}
