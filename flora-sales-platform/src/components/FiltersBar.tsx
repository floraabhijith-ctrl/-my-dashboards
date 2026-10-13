"use client";
import { useCallback, useEffect, useState } from "react";
import { useMeta } from "@/lib/client/hooks";
import { RATE_BANDS, STAY_DURATION_BANDS } from "@/lib/commercial";

export type Filters = Record<string, string>;

export function FiltersBar({ value, onChange, scope = "sales" }: { value: Filters; onChange: (next: Filters) => void; scope?: "sales" | "management" }) {
  const meta = useMeta();
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const Select = ({ k, label, options, all = "All" }: { k: string; label: string; options: readonly string[] | { value: string; label: string }[]; all?: string }) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
  return (
    <div className="card p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <label className="block col-span-2">
          <span className="label">Search</span>
          <input className="input" placeholder="Company, contact, reference…" value={value.q ?? ""} onChange={(e) => set("q", e.target.value)} />
        </label>
        <label className="block"><span className="label">Enquiry month</span><input className="input" type="month" value={value.enquiryMonth ?? ""} onChange={(e) => set("enquiryMonth", e.target.value)} /></label>
        <label className="block"><span className="label">Stay month</span><input className="input" type="month" value={value.stayMonth ?? ""} onChange={(e) => set("stayMonth", e.target.value)} /></label>
        <Select k="propertyId" label="Property" options={(meta?.properties ?? []).map((p) => ({ value: p.id, label: p.shortName }))} />
        <Select k="status" label="Status" options={[{ value: "__active", label: "Active only" }, ...(meta?.enums.ENQUIRY_STATUSES ?? []).map((s) => ({ value: s, label: s }))]} />
        {scope === "management" && <Select k="ownerId" label="Salesperson" options={(meta?.users ?? []).map((u) => ({ value: u.id, label: u.name }))} />}
        <Select k="enquiryType" label="Market segment" options={meta?.enums.ENQUIRY_TYPES ?? []} />
        <Select k="source" label="Source" options={meta?.enums.ENQUIRY_SOURCES ?? []} />
        <Select k="stayType" label="Stay type" options={meta?.enums.STAY_TYPES ?? []} />
        <Select k="stayDuration" label="Stay duration" options={STAY_DURATION_BANDS.map((b) => ({ value: b.key, label: b.label }))} />
        <Select k="rateBand" label="Rate band (nightly eq.)" options={RATE_BANDS.map((b) => ({ value: b.key, label: b.label }))} />
        <Select k="followUpDue" label="Follow-up due" options={[{ value: "today", label: "Due today" }, { value: "overdue", label: "Overdue" }, { value: "week", label: "Next 7 days" }, { value: "any", label: "Any scheduled" }]} all="Any" />
        <label className="block"><span className="label">Created from</span><input className="input" type="date" value={value.from ?? ""} onChange={(e) => set("from", e.target.value)} /></label>
        <label className="block"><span className="label">Created to</span><input className="input" type="date" value={value.to ?? ""} onChange={(e) => set("to", e.target.value)} /></label>
        <label className="block"><span className="label">Arrival from</span><input className="input" type="date" value={value.arrivalFrom ?? ""} onChange={(e) => set("arrivalFrom", e.target.value)} /></label>
        <label className="block"><span className="label">Arrival to</span><input className="input" type="date" value={value.arrivalTo ?? ""} onChange={(e) => set("arrivalTo", e.target.value)} /></label>
        <div className="flex items-end">
          <button className="btn-secondary w-full" onClick={() => onChange({})}>Clear filters</button>
        </div>
      </div>
    </div>
  );
}

export function useUrlFilters(): [Filters, (f: Filters) => void] {
  const [filters, setFilters] = useState<Filters>({});
  useEffect(() => {
    setFilters(Object.fromEntries(new URLSearchParams(window.location.search).entries()));
  }, []);
  const update = useCallback((f: Filters) => {
    setFilters(f);
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
    window.history.replaceState(null, "", `${window.location.pathname}${sp.toString() ? `?${sp}` : ""}`);
  }, []);
  return [filters, update];
}
