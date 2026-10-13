"use client";
import { useFetch } from "@/lib/client/hooks";
import type { EnquiryDetail } from "@/lib/client/types";
import { EnquiryForm } from "@/components/EnquiryForm";
import { Alert, PageHeader, Spinner } from "@/components/ui";

export function EditEnquiry({ id, currentUserId, currentRole }: { id: string; currentUserId: string; currentRole: string }) {
  const { data, error, loading } = useFetch<EnquiryDetail>(`/api/enquiries/${id}`);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <Alert tone="danger">{error ?? "Enquiry not found."}</Alert>;
  if (!data.permissions.canEdit) return <Alert tone="danger">You are not authorised to edit this enquiry.</Alert>;
  return (
    <>
      <PageHeader title={`Edit ${data.enquiry.enquiryRef}`} subtitle={`${data.enquiry.companyName} · ${data.enquiry.propertyName}`} />
      <EnquiryForm existing={data.enquiry} currentUserId={currentUserId} currentRole={currentRole} />
    </>
  );
}
