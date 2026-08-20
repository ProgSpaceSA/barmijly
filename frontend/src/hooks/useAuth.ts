"use client";
import { useAuthStore } from "@/store/auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/store/auth";

export function useRequireAuth(allowedRoles?: UserRole[]) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const roleKey = allowedRoles?.join(",");

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    if (roleKey && !roleKey.split(",").includes(user?.role as string)) {
      router.replace("/dashboard");
    }
  }, [token, user, router, roleKey]);

  return user;
}
