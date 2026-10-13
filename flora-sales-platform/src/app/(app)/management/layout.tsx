import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isManagement } from "@/lib/authz";

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isManagement(user)) redirect("/dashboard");
  return <>{children}</>;
}
