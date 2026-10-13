import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { EditEnquiry } from "@/components/sales/EditEnquiry";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  return <EditEnquiry id={id} currentUserId={user.id} currentRole={user.role} />;
}
