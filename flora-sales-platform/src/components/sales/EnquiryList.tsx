"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Download, FilePlus2 } from "lucide-react";
import { qs } from "@/lib/client/api";
import { useFetch } from "@/lib/client/hooks";
import type { EnquiryRow } from "@/lib/client/types";
import { EnquiryTable } from "@/components/EnquiryTable";
import { FiltersBar, useUrlFilters } from "@/components/FiltersBar";
import { Alert, DemoBanner, PageHeader, Spinner } from "@/components/ui";

interface ListResponse { items: EnquiryRow[]; total: number; page: number; pageSize: number; includeDemo: boolean }

export function EnquiryList({ scope, title, subtitle, canExport = false }: { scope: "sales" | "management"; title: string; subtitle?: string; canExport?: boolean }) {
  const [filters, setFilters] = useUrlFilters();
  const query = useMemo(() => qs({ ...filters, pageSize: 200 }), [filters]);
  const { data, error, loading } = useFetch<ListResponse>(`/api/enquiries${query}`);
  const demoCount = data?.items.filter((e) => e.isDemo).length ?? 0;
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {canExport && <a className="btn-secondary" href={`/api/exports/enquiries${qs(filters)}`}><Download className="h-4 w-4" /> Export CSV</a>}
            <Link href="/enquiries/new" className="btn-primary"><FilePlus2 className="h-4 w-4" /> New enquiry</Link>
          </>
        }
      />
      <div className="space-y-4">
        <FiltersBar value={filters} onChange={setFilters} scope={scope} />
        <DemoBanner count={demoCount} />
        {error && <Alert tone="danger">{error}</Alert>}
        {loading && !data ? <Spinner /> : data && (
          <>
            <div className="text-xs text-muted">{data.total} enquir{data.total === 1 ? "y" : "ies"}{data.total > data.items.length ? ` · showing first ${data.items.length}` : ""}</div>
            <EnquiryTable items={data.items} showOwner={scope === "management"} />
          </>
        )}
      </div>
    </>
  );
}
