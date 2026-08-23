"use client";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { useAuthStore } from "@/store/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { FullPageLoading } from "@/components/shared/LoadingSpinner";
import { can, type Action } from "@/lib/permissions";

/**
 * Survives AppShell remounts on client navigations so switching tabs does not
 * flash the full-page spinner before the page's own skeleton.
 * The server never runs the effect, so SSR/hydration still match.
 */
let appShellHydrated = false;

/** Test-only: isolate each case from a previous mount. */
export function resetAppShellHydrated() {
  appShellHydrated = false;
}

/**
 * `requires` guards the whole route, not just the buttons on it. The sidebar
 * already hides the links a role cannot use; this covers the typed URL, where
 * the page would otherwise render a shell around requests the API refuses.
 */
export function AppShell({
  children,
  requires,
}: {
  children: React.ReactNode;
  requires?: Action | Action[];
}) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const router = useRouter();
  const pathname = usePathname();
  // The persisted token exists only on the client, so the server always renders
  // the loading branch and the first client render has to match it.
  const [mounted, setMounted] = useState(appShellHydrated);
  // Below `lg` the sidebar is a drawer. It is closed on every render the user
  // did not open it for, so a route change never leaves it covering the page.
  const [navOpen, setNavOpen] = useState(false);

  const required = requires ? (Array.isArray(requires) ? requires : [requires]) : [];
  const permitted = required.length === 0 || required.some((action) => can(role, action));

  useEffect(() => {
    appShellHydrated = true;
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!token) router.replace("/login");
    else if (!permitted) router.replace("/dashboard");
  }, [mounted, token, permitted, router]);

  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    // The drawer covers the page, so the page behind it must not scroll under
    // the finger. The original value is restored rather than cleared, in case a
    // modal on the page set it first.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  if (!mounted || !token || !permitted) return <FullPageLoading />;

  return (
    <div className="brm-shell">
      <CommandPalette />

      {/* Mobile bar — the only way to reach the drawer below `lg` */}
      <header className="brm-topbar lg:hidden">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="brm-topbar-btn"
          aria-label="فتح القائمة"
          aria-controls="brm-sidebar"
          aria-expanded={navOpen}
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="brm-topbar-brand">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="26" height="26" className="shrink-0 rounded-md" aria-hidden>
            <defs>
              <linearGradient id="brmTopbarLogo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#4F46E5" />
                <stop offset="1" stopColor="#7C3AED" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" fill="url(#brmTopbarLogo)" rx="8" />
            <text x="16" y="22.5" textAnchor="middle" fontFamily="'Courier New', Courier, monospace" fontWeight="800" fontSize="15" fill="#fff" letterSpacing="-0.5" direction="ltr">br.</text>
          </svg>
          برمجلي
        </span>
      </header>

      {navOpen && (
        <div
          className="brm-sidebar-backdrop lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />

      <main className="brm-main">{children}</main>
    </div>
  );
}
