import { useQuery } from "@tanstack/react-query";
import { fetchTranquilityStatus } from "../../Functions/EveESI/fetchTranquilityStatus.js";
import { queryClient } from "../../queryClient.js";

export const TRANQUILITY_SERVER_STATUS_QUERY_KEY = ["esi", "tranquility-server-status"];

/**
 * Sync read of the cached Tranquility `/status/` result (same entry as {@link useTranquilityServerStatusQuery}).
 * Use from other query `queryFn`s, Zustand, or `enabled` logic when you only need a snapshot.
 * Returns `undefined` if the app has not successfully fetched yet.
 *
 * @returns {{ online: boolean; playerCount: number } | undefined}
 */
export function getTranquilityServerStatusFromCache() {
  return queryClient.getQueryData(TRANQUILITY_SERVER_STATUS_QUERY_KEY);
}

/**
 * Simple boolean check for other queries and sync code: `true` only when the cache holds a
 * successful result with Tranquility online. `false` when offline, missing cache, or not yet fetched.
 *
 * For React `enabled`, prefer combining with {@link useTranquilityServerStatusQuery} so the flag
 * updates when status changes; this helper is best inside `queryFn` or one-off snapshots.
 *
 * @returns {boolean}
 */
export function isTranquilityOnlineFromCache() {
  return getTranquilityServerStatusFromCache()?.online === true;
}

/** React Query metadata for the Tranquility status query (status, `dataUpdatedAt`, etc.). */
export function getTranquilityServerStatusQueryState() {
  return queryClient.getQueryState(TRANQUILITY_SERVER_STATUS_QUERY_KEY);
}

const ONLINE_POLL_MS = 15 * 60 * 1000;
const OFFLINE_POLL_MS = 5 * 60 * 1000;

/** Base options for Tranquility `/status/` polling (ESI). */
export function tranquilityServerStatusQueryOptions() {
  return {
    queryKey: TRANQUILITY_SERVER_STATUS_QUERY_KEY,
    queryFn: fetchTranquilityStatus,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) {
        return false;
      }
      return d.online ? ONLINE_POLL_MS : OFFLINE_POLL_MS;
    },
    retry: (failureCount, error) =>
      error?.message === "TRANQUILITY_RATE_LIMIT" && failureCount < 50,
    retryDelay: (_failureCount, error) =>
      typeof error?.delayMs === "number" ? error.delayMs : 1000,
  };
}

/**
 * Cached Tranquility online state + player count, polled on an online/offline-aware interval.
 * Mount once at app root (`App.jsx`) so non-React code can read the same cache via `queryClient`.
 */
export function useTranquilityServerStatusQuery() {
  return useQuery(tranquilityServerStatusQueryOptions());
}
