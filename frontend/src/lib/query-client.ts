import { MutationCache, QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";

let client: QueryClient | null = null;
let sessionEpoch = 0;

export function getSessionEpoch() {
  return sessionEpoch;
}

/**
 * Read models that are rollups of rows *some other* family owns: the dashboard
 * counters, the overdue list, the per-developer table, the monthly trend. No
 * write hook can be expected to remember them, and forgetting one leaves the
 * landing page quoting numbers from before the change. They are only ever
 * active on the page that shows them, so refreshing them after every successful
 * write costs nothing anywhere else.
 */
const DERIVED_KEYS = [qk.reports.all];

export function createQueryClient() {
  // Bound to *this* client, not the module-level one: a session change swaps the
  // client mid-flight, and a mutation from the previous user must not refill the
  // next user's cache.
  const own: { current: QueryClient | null } = { current: null };
  own.current = client = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: () => {
        for (const queryKey of DERIVED_KEYS) own.current?.invalidateQueries({ queryKey });
      },
    }),
    defaultOptions: {
      queries: {
        retry: 1,
        // Long enough to keep a back-and-forth between two pages off the wire,
        // short enough that returning to a list after working a ticket shows
        // the change. Focus and reconnect refetches cover the rest.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
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
