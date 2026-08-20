"use client";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FullPageLoading } from "@/components/shared/LoadingSpinner";
import { can, type Action } from "@/lib/permissions";

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
  requires?: Action;
}) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const router = useRouter();
  // The persisted token exists only on the client, so the server always renders
  // the loading branch and the first client render has to match it.
  const [mounted, setMounted] = useState(false);

  const permitted = !requires || can(role, requires);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!token) router.replace("/login");
    else if (!permitted) router.replace("/dashboard");
  }, [mounted, token, permitted, router]);

  if (!mounted || !token || !permitted) return <FullPageLoading />;

  return (
    <div className="brm-shell">
      <CommandPalette />
      <Sidebar />
      <main className="mr-64 min-h-screen px-8 py-6 max-w-[1400px]">
        {children}
      </main>
    </div>
  );
}
