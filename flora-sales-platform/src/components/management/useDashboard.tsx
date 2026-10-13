"use client";
import { useMemo, type ReactNode } from "react";
import { qs } from "@/lib/client/api";
import { useFetch } from "@/lib/client/hooks";
import type { SlimEnquiry } from "@/lib/client/types";
import { FiltersBar, useUrlFilters, type Filters } from "@/components/FiltersBar";
import { Alert, DemoBanner, PageHeader, Spinner } from "@/components/ui";

export interface Summary { enquiries: number; active: number; quotations: number; confirmed: number; lost: number; conversionBps: number; pipelineRevenue: number; confirmedRevenue: number; roomNights: number; confirmedRoomNights: number; shortStay: number; longStay: number }
export interface Dashboard {
  generatedAt: string;
  includeDemo: boolean;
  demoCount: number;
  kpis: Record<string, number>;
  trends: { series: (Summary & { month: string; bySource: Record<string, number>; byProperty: Record<string, number> })[]; yoy: { month: string; current: number; previousYear: number | null }[] };
  bySource: (Summary & { source: string })[];
  byProperty: (Summary & { propertyId: string; propertyName: string; propertyCode: string })[];
  bySegment: (Summary & { segment: string })[];
  salespeople: (Summary & { ownerId: string; ownerName: string; properties: string; followUpsCompleted: number; overdueFollowUps: number })[];
  funnel: { stages: { stage: string; current: number; reached: number; revenue: number }[]; closed: { confirmed: number; lost: number; cancelled: number }; statusMix: { status: string; count: number }[] };
  negotiation: { averages: { requested: number | null; proposed: number | null; revised: number | null; approved: number | null; discountBps: number | null }; attention: SlimEnquiry[]; pendingApprovalCases: number; pendingApprovals: number; rows: SlimEnquiry[] };
  followUps: { dueToday: SlimEnquiry[]; overdue: SlimEnquiry[]; dueThisWeek: SlimEnquiry[]; inactiveWarning: SlimEnquiry[]; inactiveCritical: SlimEnquiry[]; quotationsAwaiting: SlimEnquiry[]; highValueStale: SlimEnquiry[]; thresholds: { warningDays: number; criticalDays: number; highValueAed: number; quotationDays: number } };
  outlook: { stayMonth: string; confirmedRoomNights: number; pipelineRoomNights: number; confirmedRevenue: number; pipelineRevenue: number; weightedPipelineRevenue: number; enquiries: number; byProperty: Record<string, { roomNights: number; revenue: number }> }[];
  stayMix: { shortStay: number; longStay: number };
}

export function useDashboard() {
  const [filters, setFilters] = useUrlFilters();
  const query = useMemo(() => qs(filters), [filters]);
  const state = useFetch<Dashboard>(`/api/analytics/dashboard${query}`);
  return { filters, setFilters, ...state };
}

/** Standard management page frame: header, filters, demo banner, loading/error handling. */
export function DashboardFrame({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: (f: Filters) => ReactNode; children: (d: Dashboard, filters: Filters) => ReactNode }) {
  const { filters, setFilters, data, error, loading } = useDashboard();
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={actions?.(filters)} />
      <div className="space-y-4">
        <FiltersBar value={filters} onChange={setFilters} scope="management" />
        {error && <Alert tone="danger">{error}</Alert>}
        {loading && !data ? <Spinner /> : data && (
          <>
            <DemoBanner count={data.demoCount} />
            {children(data, filters)}
          </>
        )}
      </div>
    </>
  );
}
