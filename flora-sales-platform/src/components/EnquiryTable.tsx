"use client";
import Link from "next/link";
import { Pencil, Eye } from "lucide-react";
import type { EnquiryRow } from "@/lib/client/types";
import { aed, fmtDate, todayDubai } from "@/lib/client/format";
import { StatusBadge, Badge, Empty } from "@/components/ui";

export function EnquiryTable({ items, showOwner = false, compact = false }: { items: EnquiryRow[]; showOwner?: boolean; compact?: boolean }) {
  const today = todayDubai();
  if (!items.length) return <Empty title="No enquiries match the current filters.">Adjust the filters or register a new enquiry.</Empty>;
  const closed = (s: string) => ["Confirmed", "Lost", "Cancelled"].includes(s);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Enquiry Date</th>
            <th>Enquiry ID</th>
            <th>Property</th>
            {showOwner && <th>Salesperson</th>}
            <th>Company</th>
            <th>Contact</th>
            <th>Arrival</th>
            <th>Departure</th>
            <th className="text-right">Rooms</th>
            <th className="text-right">Nights</th>
            <th className="text-right">Requested</th>
            <th className="text-right">Proposed</th>
            <th className="text-right">Potential Rev.</th>
            <th>Status</th>
            <th>Last Follow-up</th>
            <th>Next Follow-up</th>
            {!compact && <th>Latest Remarks</th>}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => {
            const overdue = !closed(e.status) && e.nextFollowUpAt && e.nextFollowUpAt < today;
            const dueToday = !closed(e.status) && e.nextFollowUpAt === today;
            return (
              <tr key={e.id}>
                <td>{fmtDate(e.createdAt)}</td>
                <td>
                  <Link href={`/enquiries/${e.id}`} className="font-medium text-plum-600 hover:underline">{e.enquiryRef}</Link>
                  {e.isDemo && <span className="ml-1"><Badge tone="warning">Demo</Badge></span>}
                </td>
                <td>{e.propertyCode}</td>
                {showOwner && <td>{e.ownerName}</td>}
                <td className="max-w-[220px] truncate" title={e.companyName}>{e.companyName}</td>
                <td className="max-w-[160px] truncate" title={e.contactPerson}>{e.contactPerson}</td>
                <td>{fmtDate(e.arrivalDate)}</td>
                <td>{fmtDate(e.departureDate)}</td>
                <td className="text-right tabular-nums">{e.rooms}</td>
                <td className="text-right tabular-nums">{e.nights}</td>
                <td className="text-right tabular-nums">{aed(e.requestedRate)}</td>
                <td className="text-right tabular-nums">{aed(e.approvedRate ?? e.revisedRate ?? e.proposedRate)}</td>
                <td className="text-right tabular-nums font-medium">{aed(e.potentialRevenue)}</td>
                <td><StatusBadge status={e.status} /></td>
                <td>{fmtDate(e.lastFollowUpAt)}</td>
                <td className={overdue ? "text-danger font-medium" : dueToday ? "text-warning font-medium" : ""}>{fmtDate(e.nextFollowUpAt)}{overdue ? " · overdue" : dueToday ? " · today" : ""}</td>
                {!compact && <td className="max-w-[260px] truncate text-muted" title={e.latestClientResponse ?? e.nextAction ?? ""}>{e.latestClientResponse ?? e.nextAction ?? "—"}</td>}
                <td>
                  <div className="flex gap-1">
                    <Link href={`/enquiries/${e.id}`} className="btn-ghost p-1.5" title="Open"><Eye className="h-4 w-4" /></Link>
                    <Link href={`/enquiries/${e.id}/edit`} className="btn-ghost p-1.5" title="Edit"><Pencil className="h-4 w-4" /></Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
