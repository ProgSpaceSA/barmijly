"use client";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FullPageLoading } from "@/components/shared/LoadingSpinner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [isAuthenticated, router]);

  if (!isAuthenticated()) return <FullPageLoading />;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="mr-64 min-h-screen p-6">
        {children}
      </main>
    </div>
  );
}
