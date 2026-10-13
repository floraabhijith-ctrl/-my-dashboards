"use client";
import Link from "next/link";
import type { SlimEnquiry } from "@/lib/client/types";
import { aed, fmtDate, fmtDateTime, pct } from "@/lib/client/format";
import { Badge, Empty, StatusBadge } from "@/components/ui";

type Col = "ref" | "company" | "property" | "owner" | "status" | "arrival" | "rooms" | "nights" | "requested" | "proposed" | "revised" | "approved" | "variance" | "discount" | "nightly" | "potential" | "expected" | "probability" | "nextFollowUp" | "lastFollowUp" | "lastActivity" | "nextAction" | "created";

const HEAD: Record<Col, { label: string; right?: boolean }> = {
  ref: { label: "Enquiry" }, company: { label: "Company" }, property: { label: "Property" }, owner: { label: "Salesperson" }, status: { label: "Status" }, arrival: { label: "Arrival" }, rooms: { label: "Rooms", right: true }, nights: { label: "Nights", right: true },
  requested: { label: "Requested", right: true }, proposed: { label: "Proposed", right: true }, revised: { label: "Revised", right: true }, approved: { label: "Approved", right: true }, variance: { label: "Req − Prop", right: true }, discount: { label: "Discount", right: true }, nightly: { label: "Nightly eq.", right: true },
  potential: { label: "Potential", right: true }, expected: { label: "Expected", right: true }, probability: { label: "Prob.", right: true }, nextFollowUp: { label: "Next follow-up" }, lastFollowUp: { label: "Last follow-up" }, lastActivity: { label: "Last activity" }, nextAction: { label: "Next action" }, created: { label: "Created" },
};

export function SlimTable({ rows, cols, empty = "Nothing to show." }: { rows: SlimEnquiry[]; cols: Col[]; empty?: string }) {
  if (!rows.length) return <Empty title={empty} />;
  const cell = (e: SlimEnquiry, c: Col) => {
    switch (c) {
      case "ref": return <><Link href={`/enquiries/${e.id}`} className="font-medium text-plum-600 hover:underline">{e.enquiryRef}</Link>{e.isDemo && <span className="ml-1"><Badge tone="warning">Demo</Badge></span>}</>;
      case "company": return <span className="block max-w-[200px] truncate" title={e.companyName}>{e.companyName}</span>;
      case "property": return e.propertyCode;
      case "owner": return e.ownerName;
      case "status": return <StatusBadge status={e.status} />;
      case "arrival": return fmtDate(e.arrivalDate);
      case "rooms": return e.rooms;
      case "nights": return e.nights;
      case "requested": return aed(e.requestedRate);
      case "proposed": return aed(e.proposedRate);
      case "revised": return aed(e.revisedRate);
      case "approved": return aed(e.approvedRate);
      case "variance": return aed(e.rateVariance);
      case "discount": return pct(e.discountBps);
      case "nightly": return aed(e.nightlyEquivalentRate);
      case "potential": return <span className="font-medium">{aed(e.potentialRevenue)}</span>;
      case "expected": return aed(e.expectedBookingValue);
      case "probability": return `${e.probability}%`;
      case "nextFollowUp": return fmtDate(e.nextFollowUpAt);
      case "lastFollowUp": return fmtDate(e.lastFollowUpAt);
      case "lastActivity": return fmtDateTime(e.lastActivityAt);
      case "nextAction": return <span className="block max-w-[220px] truncate text-muted" title={e.nextAction ?? ""}>{e.nextAction ?? "—"}</span>;
      case "created": return fmtDate(e.createdAt);
    }
  };
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{cols.map((c) => <th key={c} className={HEAD[c].right ? "text-right" : ""}>{HEAD[c].label}</th>)}</tr></thead>
        <tbody>{rows.map((e) => <tr key={e.id}>{cols.map((c) => <td key={c} className={HEAD[c].right ? "text-right tabular-nums" : ""}>{cell(e, c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
