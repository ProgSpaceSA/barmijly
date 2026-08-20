import axios, { CanceledError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/store/auth";
import { getSessionEpoch } from "@/lib/query-client";

type SessionConfig = InternalAxiosRequestConfig & { sessionEpoch?: number };

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "https://barmijly.ai/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const { token } = useAuthStore.getState();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  (config as SessionConfig).sessionEpoch = getSessionEpoch();
  return config;
});

function isStaleSession(config?: InternalAxiosRequestConfig) {
  if (!config) return false;
  const started = (config as SessionConfig).sessionEpoch;
  return started !== undefined && started !== getSessionEpoch();
}

api.interceptors.response.use(
  (res) => {
    if (isStaleSession(res.config)) {
      return Promise.reject(new CanceledError("session changed"));
    }
    return res;
  },
  (error) => {
    if (isStaleSession(error.config)) {
      return Promise.reject(new CanceledError("session changed"));
    }
    // Dropping the token is the whole reaction: the route guards watch it and
    // redirect. Navigating here instead would restart the navigation for every
    // parallel 401, which never settles. The token check keeps it idempotent.
    // A failed login is 401 "bad credentials", not a dead session — logging
    // out here remounts the page and looks like a full refresh.
    const requestUrl = String(error.config?.url ?? "");
    const isLoginAttempt = requestUrl.includes("/auth/login");
    if (error.response?.status === 401 && useAuthStore.getState().token && !isLoginAttempt) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export default api;
