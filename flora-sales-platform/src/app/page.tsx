import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isManagement } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(isManagement(user) ? "/management" : "/dashboard");
}
