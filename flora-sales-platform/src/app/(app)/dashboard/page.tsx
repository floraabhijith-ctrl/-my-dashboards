import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { MyDashboard } from "@/components/sales/MyDashboard";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <MyDashboard userName={user.name} />;
}
