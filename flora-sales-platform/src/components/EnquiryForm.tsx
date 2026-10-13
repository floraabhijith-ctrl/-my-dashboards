"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, AlertTriangle } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useMeta } from "@/lib/client/hooks";
import type { EnquiryRow } from "@/lib/client/types";
import { computeCommercials, classifyStay, toFils, type RateBasis } from "@/lib/commercial";
import { aed, pct, fmtDate } from "@/lib/client/format";
import { Alert, Card, Field } from "@/components/ui";

type FormState = {
  propertyId: string; ownerId: string; source: string; enquiryType: string; priority: string;
  companyName: string; contactPerson: string; email: string; phone: string; country: string; accountType: string; clientRemarks: string;
  arrivalDate: string; departureDate: string; rooms: string; roomCategory: string; guests: string; mealPlan: string; additionalRequirements: string; stayType: string;
  requestedRate: string; proposedRate: string; revisedRate: string; rateBasis: string; taxInclusion: string; probability: string;
  status: string; lostReason: string;
  lastFollowUpAt: string; nextFollowUpAt: string; followUpMethod: string; latestClientResponse: string; nextAction: string; salesNotes: string; delayReason: string; rateChangeReason: string;
};

const empty: FormState = {
  propertyId: "", ownerId: "", source: "Email", enquiryType: "Corporate", priority: "Medium",
  companyName: "", contactPerson: "", email: "", phone: "", country: "United Arab Emirates", accountType: "New", clientRemarks: "",
  arrivalDate: "", departureDate: "", rooms: "1", roomCategory: "", guests: "", mealPlan: "", additionalRequirements: "", stayType: "",
  requestedRate: "", proposedRate: "", revisedRate: "", rateBasis: "Per Room Per Night", taxInclusion: "Inclusive of taxes", probability: "50",
  status: "New Enquiry", lostReason: "",
  lastFollowUpAt: "", nextFollowUpAt: "", followUpMethod: "", latestClientResponse: "", nextAction: "", salesNotes: "", delayReason: "", rateChangeReason: "",
};

function fromRow(e: EnquiryRow): FormState {
  const r = (v: number | null) => (v === null ? "" : String(v / 100));
  return {
    ...empty,
    propertyId: e.propertyId, ownerId: e.ownerId, source: e.source, enquiryType: e.enquiryType, priority: e.priority,
    companyName: e.companyName, contactPerson: e.contactPerson, email: e.email ?? "", phone: e.phone ?? "", country: e.country ?? "", accountType: e.accountType, clientRemarks: e.clientRemarks ?? "",
    arrivalDate: e.arrivalDate, departureDate: e.departureDate, rooms: String(e.rooms), roomCategory: e.roomCategory ?? "", guests: e.guests === null ? "" : String(e.guests), mealPlan: e.mealPlan ?? "", additionalRequirements: e.additionalRequirements ?? "", stayType: e.stayType,
    requestedRate: r(e.requestedRate), proposedRate: r(e.proposedRate), revisedRate: r(e.revisedRate), rateBasis: e.rateBasis, taxInclusion: e.taxInclusion, probability: String(e.probability),
    status: e.status, lostReason: e.lostReason ?? "",
    lastFollowUpAt: e.lastFollowUpAt ?? "", nextFollowUpAt: e.nextFollowUpAt ?? "", followUpMethod: e.followUpMethod ?? "", latestClientResponse: e.latestClientResponse ?? "", nextAction: e.nextAction ?? "", salesNotes: e.salesNotes ?? "", delayReason: e.delayReason ?? "",
  };
}

const nightsBetween = (a: string, b: string) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : 0);
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

type Setter = (k: keyof FormState, v: string) => void;
function Sel({ f: form, set, k, options, allowEmpty = false, disabled = false }: { f: FormState; set: Setter; k: keyof FormState; options: readonly string[]; allowEmpty?: boolean; disabled?: boolean }) {
  return (
    <select className="input" value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={disabled}>
      {allowEmpty && <option value="">—</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function In({ f: form, set, k, type = "text", ...rest }: { f: FormState; set: Setter; k: keyof FormState; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" type={type} value={form[k]} onChange={(e) => set(k, e.target.value)} {...rest} />;
}
function Ta({ f: form, set, k, rows = 2 }: { f: FormState; set: Setter; k: keyof FormState; rows?: number }) {
  return <textarea className="input" rows={rows} value={form[k]} onChange={(e) => set(k, e.target.value)} />;
}

export function EnquiryForm({ existing, currentUserId, currentRole }: { existing?: EnquiryRow; currentUserId: string; currentRole: string }) {
  const router = useRouter();
  const meta = useMeta();
  const [form, setForm] = useState<FormState>(existing ? fromRow(existing) : { ...empty, ownerId: currentUserId });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dupes, setDupes] = useState<{ id: string; enquiryRef: string; companyName: string; arrivalDate: string; status: string; ownerName: string }[]>([]);
  const idempotencyKey = useRef<string>(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));
  const stayTypeTouched = useRef(Boolean(existing));

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Default property for new enquiries once meta loads
  useEffect(() => {
    if (!existing && meta && !form.propertyId && meta.properties[0]) set("propertyId", meta.properties[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const nights = useMemo(() => nightsBetween(form.arrivalDate, form.departureDate), [form.arrivalDate, form.departureDate]);
  const longStayThreshold = meta?.settings.longStayThresholdNights ?? 28;

  useEffect(() => {
    if (!stayTypeTouched.current && nights > 0) set("stayType", classifyStay(nights, longStayThreshold));
  }, [nights, longStayThreshold]);

  const calc = useMemo(
    () =>
      computeCommercials({
        rooms: Number(form.rooms) || 0,
        nights: Math.max(0, nights),
        rateBasis: form.rateBasis as RateBasis,
        probability: Number(form.probability) || 0,
        requestedRate: toFils(numOrNull(form.requestedRate)),
        proposedRate: toFils(numOrNull(form.proposedRate)),
        revisedRate: toFils(numOrNull(form.revisedRate)),
        approvedRate: existing?.approvedRate ?? null,
      }),
    [form.rooms, nights, form.rateBasis, form.probability, form.requestedRate, form.proposedRate, form.revisedRate, existing?.approvedRate],
  );
  const approvalThreshold = meta?.settings.approvalDiscountThresholdPct ?? 10;
  const needsApproval = calc.discountBps !== null && calc.discountBps > approvalThreshold * 100 && existing?.approvedRate == null;

  // Duplicate detection (debounced)
  useEffect(() => {
    if (form.companyName.trim().length < 3 || !form.propertyId || !form.arrivalDate) return setDupes([]);
    const t = setTimeout(() => {
      api<{ duplicates: typeof dupes }>("/api/enquiries/duplicates", { method: "POST", body: { companyName: form.companyName, propertyId: form.propertyId, arrivalDate: form.arrivalDate, excludeId: existing?.id } })
        .then((d) => setDupes(d.duplicates))
        .catch(() => setDupes([]));
    }, 500);
    return () => clearTimeout(t);
  }, [form.companyName, form.propertyId, form.arrivalDate, existing?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setErrors({});
    const body = {
      ...form,
      ownerId: form.ownerId || undefined,
      rooms: Number(form.rooms),
      guests: form.guests === "" ? null : Number(form.guests),
      mealPlan: form.mealPlan || null,
      stayType: form.stayType || null,
      requestedRate: numOrNull(form.requestedRate),
      proposedRate: numOrNull(form.proposedRate),
      revisedRate: numOrNull(form.revisedRate),
      probability: Number(form.probability),
      followUpMethod: form.followUpMethod || null,
      idempotencyKey: existing ? undefined : idempotencyKey.current,
      version: existing?.version,
    };
    try {
      if (existing) {
        await api(`/api/enquiries/${existing.id}`, { method: "PATCH", body });
        router.push(`/enquiries/${existing.id}?saved=1`);
      } else {
        const res = await api<{ enquiry: EnquiryRow }>("/api/enquiries", { method: "POST", body });
        router.push(`/enquiries/${res.enquiry.id}?saved=1`);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setError(err.status === 409 ? err.message : err.status === 422 ? "Please correct the highlighted fields." : err.message);
      } else setError("Saving failed. Check your connection and try again.");
      setSaving(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const enums = meta?.enums;
  if (!meta) return <div className="text-sm text-muted">Loading form…</div>;
  const canChooseOwner = currentRole !== "SALES_EXECUTIVE" && !existing;

  return (
    <form onSubmit={submit} className="space-y-5 pb-24">
      {error && <Alert tone="danger">{error}</Alert>}
      {dupes.length > 0 && (
        <Alert tone="warning" title="Possible duplicate enquiry">
          {dupes.map((d) => (
            <div key={d.id}>
              <Link className="underline" href={`/enquiries/${d.id}`}>{d.enquiryRef}</Link> · {d.companyName} · arrival {fmtDate(d.arrivalDate)} · {d.status} · {d.ownerName}
            </div>
          ))}
          <div className="mt-1 text-xs">You can continue if this is a genuinely new requirement.</div>
        </Alert>
      )}

      <Card title="A. Enquiry information" pearl>
        {existing && (
          <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-4">
            <div><span className="label">Enquiry ID</span><span className="font-medium text-plum-700">{existing.enquiryRef}</span></div>
            <div><span className="label">Created</span>{fmtDate(existing.createdAt)}</div>
            <div><span className="label">Last updated</span>{fmtDate(existing.updatedAt)}</div>
            <div><span className="label">Assigned to</span>{existing.ownerName}</div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Property" required error={errors.propertyId}>
            <select className="input" value={form.propertyId} onChange={(e) => set("propertyId", e.target.value)}>
              {meta.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Assigned salesperson" hint={canChooseOwner ? undefined : "Automatically set to you"}>
            {canChooseOwner ? (
              <select className="input" value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                {meta.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <input className="input" value={existing ? existing.ownerName : (meta.users.find((u) => u.id === currentUserId)?.name ?? "You")} disabled />
            )}
          </Field>
          <Field label="Enquiry source" required error={errors.source}><Sel f={form} set={set} k="source" options={enums!.ENQUIRY_SOURCES} /></Field>
          <Field label="Enquiry type" required error={errors.enquiryType}><Sel f={form} set={set} k="enquiryType" options={enums!.ENQUIRY_TYPES} /></Field>
          <Field label="Priority" required><Sel f={form} set={set} k="priority" options={enums!.PRIORITIES} /></Field>
        </div>
      </Card>

      <Card title="B. Client / company information">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Company name" required error={errors.companyName}><In f={form} set={set} k="companyName" autoComplete="organization" /></Field>
          <Field label="Contact person" required error={errors.contactPerson}><In f={form} set={set} k="contactPerson" /></Field>
          <Field label="E-mail" error={errors.email}><In f={form} set={set} k="email" type="email" /></Field>
          <Field label="Telephone / mobile" error={errors.phone}><In f={form} set={set} k="phone" type="tel" /></Field>
          <Field label="Country"><In f={form} set={set} k="country" /></Field>
          <Field label="Corporate account"><Sel f={form} set={set} k="accountType" options={enums!.ACCOUNT_TYPES} /></Field>
          <Field label="Client remarks" className="sm:col-span-2 lg:col-span-3"><Ta f={form} set={set} k="clientRemarks" /></Field>
        </div>
      </Card>

      <Card title="C. Accommodation requirements">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Arrival date" required error={errors.arrivalDate}><In f={form} set={set} k="arrivalDate" type="date" /></Field>
          <Field label="Departure date" required error={errors.departureDate}><In f={form} set={set} k="departureDate" type="date" min={form.arrivalDate || undefined} /></Field>
          <Field label="Nights" hint="Calculated"><input className="input" value={nights > 0 ? nights : ""} disabled /></Field>
          <Field label="Number of rooms" required error={errors.rooms}><In f={form} set={set} k="rooms" type="number" min={1} /></Field>
          <Field label="Room category"><In f={form} set={set} k="roomCategory" placeholder="e.g. Deluxe Room, One Bedroom Apartment" /></Field>
          <Field label="Occupancy / guests"><In f={form} set={set} k="guests" type="number" min={0} /></Field>
          <Field label="Meal plan"><Sel f={form} set={set} k="mealPlan" options={enums!.MEAL_PLANS} allowEmpty /></Field>
          <Field label="Stay classification" hint={`Auto: ${longStayThreshold}+ nights = Long Stay`}>
            <select className="input" value={form.stayType} onChange={(e) => { stayTypeTouched.current = true; set("stayType", e.target.value); }}>
              {enums!.STAY_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Additional requirements" className="col-span-2 sm:col-span-3 lg:col-span-4"><Ta f={form} set={set} k="additionalRequirements" /></Field>
        </div>
      </Card>

      <Card title="D. Commercial details">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Rate basis" required hint="All rates below share this basis"><Sel f={form} set={set} k="rateBasis" options={enums!.RATE_BASES} /></Field>
          <Field label="Tax"><Sel f={form} set={set} k="taxInclusion" options={enums!.TAX_INCLUSIONS} /></Field>
          <Field label="Client requested rate (AED)" error={errors.requestedRate}><In f={form} set={set} k="requestedRate" type="number" min={0} step="0.01" inputMode="decimal" /></Field>
          <Field label="Initial hotel proposed rate (AED)" error={errors.proposedRate}><In f={form} set={set} k="proposedRate" type="number" min={0} step="0.01" inputMode="decimal" /></Field>
          <Field label="Revised rate (AED)" error={errors.revisedRate}><In f={form} set={set} k="revisedRate" type="number" min={0} step="0.01" inputMode="decimal" /></Field>
          <Field label="Final approved rate (AED)" hint="Set through the approval workflow"><input className="input" value={existing?.approvedRate != null ? existing.approvedRate / 100 : ""} disabled /></Field>
          <Field label="Probability of conversion (%)" required error={errors.probability}><In f={form} set={set} k="probability" type="number" min={0} max={100} /></Field>
          <Field label="Reason for rate change" hint="Recorded in negotiation history"><In f={form} set={set} k="rateChangeReason" placeholder="e.g. Volume discount for 20 rooms" /></Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-pearl p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div><div className="label">Rate variance</div><div className="font-medium tabular-nums">{aed(calc.rateVariance)}</div></div>
          <div><div className="label">Discount vs proposed</div><div className={`font-medium tabular-nums ${needsApproval ? "text-danger" : ""}`}>{pct(calc.discountBps)}</div></div>
          <div><div className="label">Total room nights</div><div className="font-medium tabular-nums">{calc.totalRoomNights.toLocaleString()}</div></div>
          <div><div className="label">Nightly equivalent</div><div className="font-medium tabular-nums">{aed(calc.nightlyEquivalentRate)}</div></div>
          <div><div className="label">Potential room revenue</div><div className="font-medium tabular-nums">{aed(calc.potentialRevenue)}</div></div>
          <div><div className="label">Expected booking value</div><div className="font-medium tabular-nums">{aed(calc.expectedBookingValue)}</div></div>
        </div>
        {needsApproval && (
          <div className="mt-3 flex items-start gap-2 text-xs text-danger"><AlertTriangle className="h-4 w-4 shrink-0" /> Discount exceeds the {approvalThreshold}% authority threshold. Saving will raise an internal approval request and set the status to “Awaiting Internal Approval”.</div>
        )}
        {form.rateBasis === "Monthly Package" && <p className="mt-2 text-xs text-muted">Monthly package revenue is normalised on a 30-day month: rate × rooms × nights ÷ 30.</p>}
        {form.rateBasis === "Total Package" && <p className="mt-2 text-xs text-muted">Total package: the rate entered is the total value for all rooms and nights.</p>}
      </Card>

      <Card title="E. Lead status">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Status" required error={errors.status}><Sel f={form} set={set} k="status" options={enums!.ENQUIRY_STATUSES.filter((s) => s !== "Awaiting Internal Approval" || form.status === "Awaiting Internal Approval")} /></Field>
          {form.status === "Lost" && <Field label="Lost business reason" required error={errors.lostReason} className="sm:col-span-2"><In f={form} set={set} k="lostReason" placeholder="Mandatory when closing as Lost" /></Field>}
        </div>
      </Card>

      <Card title="F. Follow-up information">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Last follow-up date" error={errors.lastFollowUpAt}><In f={form} set={set} k="lastFollowUpAt" type="date" /></Field>
          <Field label="Next follow-up date" error={errors.nextFollowUpAt}><In f={form} set={set} k="nextFollowUpAt" type="date" /></Field>
          <Field label="Follow-up method"><Sel f={form} set={set} k="followUpMethod" options={enums!.FOLLOW_UP_METHODS} allowEmpty /></Field>
          <Field label="Latest client response" className="sm:col-span-2 lg:col-span-3"><Ta f={form} set={set} k="latestClientResponse" /></Field>
          <Field label="Next action required" className="sm:col-span-2"><In f={form} set={set} k="nextAction" /></Field>
          <Field label="Reason for delay"><In f={form} set={set} k="delayReason" /></Field>
          <Field label="Salesperson notes" className="sm:col-span-2 lg:col-span-3"><Ta f={form} set={set} k="salesNotes" rows={3} /></Field>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ivory/95 backdrop-blur px-4 py-3 lg:left-[260px]">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <div className="text-xs text-muted hidden sm:block">{existing ? `Editing ${existing.enquiryRef} · version ${existing.version}` : "New enquiry · the Enquiry ID is generated on save"}</div>
          <div className="flex gap-2">
            <Link href={existing ? `/enquiries/${existing.id}` : "/enquiries"} className="btn-secondary">Cancel</Link>
            <button type="submit" className="btn-primary" disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Enquiry"}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
