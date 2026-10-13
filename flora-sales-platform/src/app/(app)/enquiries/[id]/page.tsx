import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { EnquiryDetailView } from "@/components/EnquiryDetail";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const { saved } = await searchParams;
  return <EnquiryDetailView id={id} saved={saved === "1"} currentRole={user.role} />;
}
