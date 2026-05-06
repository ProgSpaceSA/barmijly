"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import {
  LayoutDashboard, Ticket, Users, Building2, Settings,
  BarChart3, Bell, LogOut, ChevronLeft, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/constants";

const navItems = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard, roles: [] },
  { href: "/tickets", label: "التذاكر", icon: Ticket, roles: [] },
  { href: "/reports", label: "التقارير", icon: BarChart3, roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] },
  { href: "/users", label: "المستخدمون", icon: Users, roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER"] },
  { href: "/companies", label: "الشركات والأنظمة", icon: Building2, roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER"] },
  { href: "/notifications", label: "الإشعارات", icon: Bell, roles: [] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasRole } = useAuthStore();

  const visibleItems = navItems.filter(item =>
    item.roles.length === 0 || item.roles.some(r => hasRole(r as any))
  );

  return (
    <aside className="fixed right-0 top-0 h-full w-64 bg-card border-l border-border flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-foreground">برمجلي</h1>
            <p className="text-xs text-muted-foreground">إدارة التذاكر</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}>
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
              {active && <ChevronLeft className="w-4 h-4 mr-auto" />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-9 h-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-muted-foreground truncate">{ROLE_LABELS[user?.role || ""]}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={logout}>
          <LogOut className="w-4 h-4 ml-2" />
          تسجيل الخروج
        </Button>
      </div>
    </aside>
  );
}
