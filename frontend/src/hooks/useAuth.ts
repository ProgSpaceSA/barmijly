"use client";
import { useAuthStore } from "@/store/auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/store/auth";

export function useRequireAuth(allowedRoles?: UserRole[]) {
  const { isAuthenticated, hasRole, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    if (allowedRoles && !hasRole(...allowedRoles)) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, hasRole, router, allowedRoles]);

  return user;
}
