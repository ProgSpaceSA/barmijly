"use client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { useState } from "react";
import { createQueryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const sessionKey = useAuthStore((s) => s.user?.id ?? "anon");
  const [session, setSession] = useState(() => ({
    key: sessionKey,
    client: createQueryClient(),
  }));

  let queryClient = session.client;
  if (session.key !== sessionKey) {
    queryClient = createQueryClient();
    setSession({ key: sessionKey, client: queryClient });
  }

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
