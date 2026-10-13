"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, FilePlus2, FolderOpen, CalendarClock, TrendingUp, Gauge, Users, Building2, PiggyBank, Handshake, BellRing, FileSpreadsheet, UserCog, Settings, LogOut, Menu, X, Bell, KeyRound,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";

export interface ShellUser { id: string; name: string; email: string; role: string; mustChangePassword: boolean }

const SALES_NAV = [
  { href: "/dashboard", label: "My Dashboard", icon: LayoutDashboard },
  { href: "/enquiries/new", label: "New Enquiry", icon: FilePlus2 },
  { href: "/enquiries", label: "My Enquiries", icon: FolderOpen },
  { href: "/calendar", label: "Follow-up Calendar", icon: CalendarClock },
  { href: "/performance", label: "My Performance", icon: TrendingUp },
];
const MGMT_NAV = [
  { href: "/management", label: "Executive Dashboard", icon: Gauge },
  { href: "/management/enquiries", label: "All Enquiries", icon: FolderOpen },
  { href: "/enquiries/new", label: "New Enquiry", icon: FilePlus2 },
  { href: "/management/salespeople", label: "Salesperson Performance", icon: Users },
  { href: "/management/properties", label: "Property Performance", icon: Building2 },
  { href: "/management/pipeline", label: "Revenue Pipeline", icon: PiggyBank },
  { href: "/management/negotiations", label: "Negotiation Tracker", icon: Handshake },
  { href: "/management/followups", label: "Follow-up Monitoring", icon: BellRing },
  { href: "/management/reports", label: "Reports", icon: FileSpreadsheet },
];
const ADMIN_NAV = [
  { href: "/admin/users", label: "User Management", icon: UserCog },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

const ROLE_LABEL: Record<string, string> = { SALES_EXECUTIVE: "Sales Executive", SALES_MANAGER: "Sales Manager", ADMIN: "Commercial Head / Admin" };

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isMgmt = user.role !== "SALES_EXECUTIVE";
  const nav = isMgmt ? [...MGMT_NAV, ...(user.role === "ADMIN" ? ADMIN_NAV : [])] : SALES_NAV;

  useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const active = (href: string) => (href === "/management" || href === "/dashboard" || href === "/enquiries" ? pathname === href : pathname.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col bg-plum-600 text-white">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-[10px] font-medium tracking-[0.3em] uppercase text-plum-200">Flora Hospitality</div>
        <div className="mt-1 text-base font-semibold leading-tight">Sales Enquiry Platform</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {isMgmt && <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-plum-300">Management</div>}
        {nav.map((n) => (
          <Link key={n.href + n.label} href={n.href} className={`nav-link ${active(n.href) ? "nav-link-active" : ""}`}>
            <n.icon className="h-4 w-4 shrink-0" /> {n.label}
          </Link>
        ))}
        {isMgmt && (
          <>
            <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-plum-300">My workspace</div>
            {SALES_NAV.filter((n) => n.href !== "/enquiries/new").map((n) => (
              <Link key={n.href} href={n.href} className={`nav-link ${active(n.href) ? "nav-link-active" : ""}`}>
                <n.icon className="h-4 w-4 shrink-0" /> {n.label}
              </Link>
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-white/10 p-4 text-xs">
        <div className="font-medium text-white truncate">{user.name}</div>
        <div className="text-plum-200 truncate">{ROLE_LABEL[user.role] ?? user.role}</div>
        <div className="mt-3 flex gap-2">
          <Link href="/account/password" className="nav-link px-2 py-1 text-xs"><KeyRound className="h-3.5 w-3.5" /> Password</Link>
          <button onClick={logout} className="nav-link px-2 py-1 text-xs"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block sticky top-0 h-screen">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-plum-900/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebar}</div>
        </div>
      )}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ivory/95 backdrop-blur px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="btn-ghost p-1.5 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle navigation">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
            <div className="text-xs text-muted hidden sm:block">Times shown in Asia/Dubai</div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>
        {user.mustChangePassword && pathname !== "/account/password" && (
          <div className="bg-warning-bg px-4 py-2 text-xs text-warning lg:px-8">
            You are using a temporary password. <Link className="underline font-medium" href="/account/password">Set a new password now</Link>.
          </div>
        )}
        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-6 max-w-[1500px] w-full">{children}</main>
      </div>
    </div>
  );
}

interface Note { id: string; title: string; body: string; enquiryId: string | null; readAt: string | null; createdAt: string; type: string }

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    try {
      const d = await api<{ notifications: Note[]; unread: number }>("/api/notifications");
      setItems(d.notifications);
      setUnread(d.unread);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  async function markAll() {
    await api("/api/notifications", { method: "PATCH", body: { ids: "all" } });
    load();
  }

  return (
    <div className="relative">
      <button className="btn-ghost relative p-2" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[90vw] card p-0 overflow-hidden z-40">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <div className="text-sm font-semibold text-plum-700">Notifications</div>
            {unread > 0 && <button className="text-xs text-plum-600 underline" onClick={markAll}>Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-6 text-center text-xs text-muted">No notifications yet.</div>}
            {items.map((n) => (
              <Link key={n.id} href={n.enquiryId ? `/enquiries/${n.enquiryId}` : "#"} onClick={() => setOpen(false)} className={`block border-b border-line/60 px-4 py-3 text-xs hover:bg-plum-50 ${n.readAt ? "" : "bg-pearl/60"}`}>
                <div className="font-medium text-plum-700">{n.title}</div>
                <div className="mt-0.5 text-muted line-clamp-2">{n.body}</div>
                <div className="mt-1 text-[10px] text-muted">{fmtDateTime(n.createdAt)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
