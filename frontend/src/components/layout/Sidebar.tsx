"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import {
  LayoutDashboard, Ticket, Users, Building2,
  BarChart3, Bell, LogOut, Layers, Mail
} from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";

const navItems = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, roles: [] },
  { href: "/tickets", label: "التذاكر", icon: Ticket, roles: [] },
  { href: "/notifications", label: "الإشعارات", icon: Bell, roles: [] },
  { href: "/reports", label: "التقارير", icon: BarChart3, roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
  { href: "/users", label: "المستخدمون", icon: Users, roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
  { href: "/companies", label: "الشركات والأنظمة", icon: Building2, roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
  { href: "/invitations", label: "الدعوات", icon: Mail, roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasRole } = useAuthStore();

  const visibleItems = navItems.filter(item =>
    item.roles.length === 0 || item.roles.some(r => hasRole(r as any))
  );

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`;

  return (
    <aside
      className="fixed right-0 top-0 h-full w-64 flex flex-col z-40"
      style={{ background: "var(--sidebar)" }}
    >
      {/* Logo */}
      <div className="px-6 py-5 flex items-center gap-3 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-none">برمجلي</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--sidebar-foreground)", opacity: 0.5 }}>إدارة طلبات البرمجة</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "text-white"
                  : "hover:text-white"
              )}
              style={{
                color: active ? "#fff" : "rgba(224,231,255,0.65)",
                background: active ? "var(--sidebar-active)" : "transparent",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-muted)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
              {active && <span className="mr-auto w-1.5 h-1.5 rounded-full bg-indigo-300" />}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="px-4 py-4 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-indigo-400/30 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs truncate" style={{ color: "rgba(224,231,255,0.5)" }}>
              {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150"
          style={{ color: "rgba(224,231,255,0.55)" }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.15)";
            (e.currentTarget as HTMLElement).style.color = "#FCA5A5";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "rgba(224,231,255,0.55)";
          }}
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
