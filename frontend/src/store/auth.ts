import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole =
  | "TICKET_REQUESTER" | "SYSTEM_OWNER" | "PROGRAMMING_HEAD"
  | "PROJECT_MANAGER" | "DEVELOPER" | "QA" | "SENIOR_MANAGEMENT";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  companyId?: string;
  company?: { id: string; name: string };
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  hasRole: (...roles: UserRole[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => {
        set({ token: null, user: null });
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          window.location.href = "/login";
        }
      },
      isAuthenticated: () => !!get().token,
      hasRole: (...roles) => roles.includes(get().user?.role as UserRole),
    }),
    {
      name: "barmijli-auth",
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
);
