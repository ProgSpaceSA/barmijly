import { QueryClient } from "@tanstack/react-query";

let client: QueryClient | null = null;
let sessionEpoch = 0;

export function getSessionEpoch() {
  return sessionEpoch;
}

export function createQueryClient() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  });
  return client;
}

/**
 * Drop the in-memory cache AND start a new session epoch.
 * In-flight requests from the previous user still resolve, but the axios
 * interceptor rejects them so they cannot refill this (or the next) client.
 */
export function resetQueryCache() {
  sessionEpoch += 1;
  if (!client) return;
  void client.cancelQueries();
  client.clear();
}
