"use client";
import { useFetch } from "@/lib/client/hooks";
import { aed, pct } from "@/lib/client/format";
import { Alert, Card, Empty, Kpi, PageHeader, Spinner } from "@/components/ui";
import { MonthlyBars, Funnel, GroupedBars } from "@/components/charts";

interface Workspace {
  kpis: Record<string, number>;
  trends: { series: { month: string; enquiries: number; quotations: number; confirmed: number; lost: number; confirmedRevenue: number; pipelineRevenue: number }[] };
  funnel: { stages: { stage: string; current: number; reached: number }[]; closed: { confirmed: number; lost: number; cancelled: number } };
  byProperty: { propertyCode: string; enquiries: number; confirmed: number; pipelineRevenue: number; confirmedRevenue: number; conversionBps: number }[];
}

export function MyPerformance() {
  const { data, error, loading } = useFetch<Workspace>("/api/analytics/workspace");
  if (loading && !data) return <Spinner />;
  if (error || !data) return <Alert tone="danger">{error ?? "Unable to load."}</Alert>;
  const k = data.kpis;
  return (
    <>
      <PageHeader title="My Performance" subtitle="Conversion and revenue outcomes for your assigned enquiries, all time." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Enquiries" value={k.totalEnquiries} />
        <Kpi label="Quotations" value={k.quotationsSent} />
        <Kpi label="Confirmed" value={k.confirmed} tone="success" />
        <Kpi label="Conversion" value={pct(k.conversionBps)} hint={`Win rate ${pct(k.winRateBps)} of decided`} />
        <Kpi label="Confirmed revenue" value={aed(k.confirmedRevenue, true)} tone="success" />
        <Kpi label="Active pipeline" value={aed(k.pipelineRevenue, true)} hint={`${k.pipelineRoomNights.toLocaleString()} room nights`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Enquiries, quotations and outcomes by month">{data.trends.series.length ? <MonthlyBars data={data.trends.series} series={[{ key: "enquiries", label: "Enquiries" }, { key: "quotations", label: "Quotations" }, { key: "confirmed", label: "Confirmed", color: "#1F7A4D" }, { key: "lost", label: "Lost", color: "#C9B8CF" }]} /> : <Empty title="No data yet." />}</Card>
        <Card title="Revenue by enquiry month">{data.trends.series.length ? <MonthlyBars money data={data.trends.series} series={[{ key: "confirmedRevenue", label: "Confirmed revenue", color: "#1F7A4D" }, { key: "pipelineRevenue", label: "Active pipeline" }]} /> : <Empty title="No data yet." />}</Card>
        <Card title="Conversion funnel"><Funnel stages={data.funnel.stages} /><div className="mt-3 text-xs text-muted">Closed: {data.funnel.closed.confirmed} confirmed · {data.funnel.closed.lost} lost · {data.funnel.closed.cancelled} cancelled</div></Card>
        <Card title="By property">{data.byProperty.length ? <GroupedBars data={data.byProperty} nameKey="propertyCode" series={[{ key: "enquiries", label: "Enquiries" }, { key: "confirmed", label: "Confirmed", color: "#1F7A4D" }]} /> : <Empty title="No data yet." />}</Card>
      </div>
    </>
  );
}
