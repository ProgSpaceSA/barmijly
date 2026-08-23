"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/hooks/useTheme";
import {
  LayoutDashboard, Ticket, Users, Building2,
  BarChart3, Bell, LogOut, Mail, UserPlus, Sun, Moon, Archive, X,
} from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";
import { useUnreadCount } from "@/hooks/useNotifications";
import { usePermissions } from "@/hooks/usePermissions";
import type { Action } from "@/lib/permissions";
/** `action: null` means every signed-in user gets the link. */
const navItems: { href: string; label: string; icon: any; action: Action | null; altAction?: Action | null }[] = [
  { href: "/dashboard",        label: "لوحة التحكم",       icon: LayoutDashboard, action: null },
  { href: "/tickets",          label: "التذاكر",            icon: Ticket,          action: null },
  { href: "/tickets/archived", label: "الأرشيف",            icon: Archive,         action: "ticket:read-archived" },
  { href: "/notifications",    label: "الإشعارات",          icon: Bell,            action: null },
  { href: "/reports",          label: "التقارير",           icon: BarChart3,       action: "report:read-team" },
  { href: "/users",            label: "المستخدمون",         icon: Users,           action: "user:read", altAction: "user:read-directory" },
  { href: "/companies",        label: "الشركات والأنظمة",  icon: Building2,       action: "structure:read-all" },
  { href: "/invitations",      label: "الدعوات",            icon: Mail,            action: "invitation:manage" },
  { href: "/signup-requests",  label: "طلبات التسجيل",     icon: UserPlus,        action: "signup:review" },
];

/**
 * One element in two modes: a permanent rail from `lg` up, and an off-canvas
 * drawer below it. `open` only matters in drawer mode — the media query in
 * `.brm-sidebar` pins the rail visible regardless, so the nav markup and every
 * active state on it stay identical across sizes.
 */
export function Sidebar({
  open = false,
  onNavigate,
}: {
  open?: boolean;
  onNavigate?: () => void;
} = {}) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { can: allowed } = usePermissions();
  const { isDark, toggle } = useTheme();
  const { data: unreadCount } = useUnreadCount();

  const visibleItems = navItems.filter((item) =>
    item.action === null ||
    allowed(item.action) ||
    (item.altAction && allowed(item.altAction)),
  );

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`;

  return (
    <aside
      id="brm-sidebar"
      className="brm-sidebar"
      data-open={open ? "true" : "false"}
      style={{
        background: `linear-gradient(180deg, var(--sidebar) 0%, var(--sidebar-end) 100%)`,
        borderLeft: "1px solid var(--sidebar-border)",
      }}
    >
      <div className="px-5 py-5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="36" height="36" className="shrink-0 rounded-lg">
          <defs>
            <linearGradient id="brmSidebarLogo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4F46E5" />
              <stop offset="1" stopColor="#7C3AED" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" fill="url(#brmSidebarLogo)" rx="8"/>
          <text x="16" y="22.5" textAnchor="middle" fontFamily="'Courier New', Courier, monospace" fontWeight="800" fontSize="15" fill="#fff" letterSpacing="-0.5" direction="ltr">br.</text>
        </svg>
        <div className="min-w-0">
          <p className="font-bold text-base leading-none" style={{ color: "var(--sidebar-foreground)" }}>برمجلي</p>
          <p className="font-brm mt-0.5" style={{ fontSize: "0.6rem", color: "var(--sidebar-foreground-dim)" }}>barmijly.ai</p>
        </div>
        <button
          type="button"
          onClick={onNavigate}
          aria-label="إغلاق القائمة"
          className="brm-sidebar-btn brm-sidebar-close lg:hidden"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/dashboard" && item.href !== "/tickets" && pathname.startsWith(item.href)) || (item.href === "/tickets" && (pathname === "/tickets" || pathname.startsWith("/tickets/new") || pathname.startsWith("/tickets/") && !pathname.startsWith("/tickets/archived")));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="brm-nav-link"
              data-active={active ? "true" : undefined}
            >
              <span className="relative inline-flex w-4 h-4 shrink-0">
                <Icon className="w-4 h-4" />
                {item.href === "/notifications" && (unreadCount as number) > 0 && (
                  <span
                    className="absolute font-brm font-bold text-white inline-flex items-center justify-center rounded-full pointer-events-none"
                    style={{
                      top: -7,
                      insetInlineEnd: -8,
                      width: (unreadCount as number) > 99 ? undefined : 16,
                      height: 16,
                      minWidth: 16,
                      paddingInline: (unreadCount as number) > 99 ? 4 : 0,
                      boxSizing: "border-box",
                      fontSize: (unreadCount as number) > 9 ? 8 : 9,
                      lineHeight: 1,
                      background: "#EF4444",
                    }}
                  >
                    {(unreadCount as number) > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="brm-dev-avatar">{initials}</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate" style={{ color: "var(--sidebar-foreground)" }}>
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate" style={{ fontSize: "0.65rem", color: "var(--sidebar-foreground-dim)" }}>
              {user?.email}
            </p>
            <p className="font-brm truncate" style={{ fontSize: "0.65rem", color: "var(--sidebar-foreground-dim)" }}>
              {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={toggle}
            className="brm-sidebar-btn flex items-center justify-center w-9 h-9 rounded-lg"
            title={isDark ? "الوضع الفاتح" : "الوضع الداكن"}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={logout}
            className="brm-sidebar-btn brm-logout flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            تسجيل الخروج
          </button>
        </div>

        <div className="text-center mt-3 hidden lg:block">
          <span className="font-brm text-[10px]" style={{ color: "var(--sidebar-foreground-dim)" }}>
            ctrl+k للبحث السريع
          </span>
        </div>
      </div>
    </aside>
  );
}
