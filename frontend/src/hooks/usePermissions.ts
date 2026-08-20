"use client";
import { useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { can, type Action } from "@/lib/permissions";

/**
 * `can("ticket:approve")` for the signed-in user.
 *
 * Prefer this over comparing `user.role` inline: role lists scattered through
 * pages are what let the UI and the API drift apart.
 */
export function usePermissions() {
  const user = useAuthStore((s) => s.user);

  const allowed = useCallback((action: Action) => can(user?.role, action), [user?.role]);

  return { can: allowed, role: user?.role, user };
}
