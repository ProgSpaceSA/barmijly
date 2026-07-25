"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/hooks/useTheme";
import {
  LayoutDashboard, Ticket, Users, Building2,
  BarChart3, Bell, LogOut, Layers, Mail, UserPlus, Sun, Moon,
} from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";

const navItems = [
  { href: "/dashboard",       label: "لوحة التحكم",      icon: LayoutDashboard, roles: [] },
  { href: "/tickets",         label: "التذاكر",           icon: Ticket,          roles: [] },
  { href: "/notifications",   label: "الإشعارات",         icon: Bell,            roles: [] },
  { href: "/reports",         label: "التقارير",          icon: BarChart3,       roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
  { href: "/users",           label: "المستخدمون",        icon: Users,           roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
  { href: "/companies",       label: "الشركات والأنظمة", icon: Building2,       roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
  { href: "/invitations",     label: "الدعوات",           icon: Mail,            roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
  { href: "/signup-requests", label: "طلبات التسجيل",    icon: UserPlus,        roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasRole } = useAuthStore();
  const { isDark, toggle } = useTheme();

  const visibleItems = navItems.filter(item =>
    item.roles.length === 0 || item.roles.some(r => hasRole(r as any))
  );

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`;

  return (
    <aside
      className="fixed right-0 top-0 h-full w-64 flex flex-col z-40"
      style={{
        background: `linear-gradient(180deg, var(--sidebar) 0%, var(--sidebar-end) 100%)`,
        borderLeft: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(99,102,241,0.18)" }}>
          <Layers className="w-5 h-5" style={{ color: "#818CF8" }} />
        </div>
        <div>
          <p className="font-bold text-base leading-none" style={{ color: "var(--sidebar-foreground)" }}>برمجلي</p>
          <p className="font-brm mt-0.5" style={{ fontSize: "0.6rem", color: "var(--sidebar-foreground-dim)" }}>barmijly.ai</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                color: active ? "#818CF8" : "var(--sidebar-foreground)",
                background: active ? "var(--sidebar-active)" : "transparent",
                borderRight: active ? "3px solid #818CF8" : "3px solid transparent",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-muted)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-4" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        {/* User info */}
        <div className="flex items-center gap-3 px-2 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "rgba(99,102,241,0.18)", color: "#818CF8" }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate" style={{ color: "var(--sidebar-foreground)" }}>
              {user?.firstName} {user?.lastName}
            </p>
            <p className="font-brm truncate" style={{ fontSize: "0.6rem", color: "var(--sidebar-foreground-dim)" }}>
              {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
            </p>
          </div>
        </div>

        {/* Actions row */}
        <div className="flex gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-all"
            style={{ color: "var(--sidebar-foreground-dim)" }}
            title={isDark ? "الوضع الفاتح" : "الوضع الداكن"}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "var(--sidebar-muted)";
              (e.currentTarget as HTMLElement).style.color = "var(--sidebar-foreground)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--sidebar-foreground-dim)";
            }}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all"
            style={{ color: "var(--sidebar-foreground-dim)" }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)";
              (e.currentTarget as HTMLElement).style.color = "#EF4444";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--sidebar-foreground-dim)";
            }}
          >
            <LogOut className="w-3.5 h-3.5" />
            تسجيل الخروج
          </button>
        </div>

        {/* Ctrl+K hint */}
        <div className="text-center mt-3">
          <span className="font-brm text-[10px]" style={{ color: "var(--sidebar-foreground-dim)" }}>
            ctrl+k للبحث السريع
          </span>
        </div>
      </div>
    </aside>
  );
}
