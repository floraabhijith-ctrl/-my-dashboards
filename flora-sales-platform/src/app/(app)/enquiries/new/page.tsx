import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { EnquiryForm } from "@/components/EnquiryForm";
import { PageHeader } from "@/components/ui";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <PageHeader title="New Enquiry" subtitle="Register a sales enquiry. Required fields are marked *. The Enquiry ID and timestamps are generated automatically." />
      <EnquiryForm currentUserId={user.id} currentRole={user.role} />
    </>
  );
}
