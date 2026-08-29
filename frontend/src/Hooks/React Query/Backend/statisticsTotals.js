import { useQuery } from "@tanstack/react-query";
import getAccountTotalsByTypeID from "../../../Functions/Endpoints/Private/statisticsTotals.js";
import GLOBAL_CONFIG from "../../../global-config-app";
import useUsersStore from "../../../Zustand/usersStore";
import { STATISTICS_QUERY_KEY_ROOT } from "./statisticsKeys.js";

/**
 * @param {string|number|null|undefined} typeID
 * @returns {string|null} Digits-only type ID or null
 */
export function normalizeTotalsTypeID(typeID) {
  if (typeID == null || typeID === "") return null;
  const id = String(typeID).trim();
  if (!id || !/^\d+$/.test(id)) return null;
  return id;
}

/**
 * React Query key for one item type's lifetime totals
 * (`GET /api/v1/statistics/account/totals`).
 * @param {string|number|null|undefined} typeID
 * @returns {import("@tanstack/react-query").QueryKey}
 */
export function totalsQueryKey(typeID) {
  const id = normalizeTotalsTypeID(typeID);
  return ["backend", STATISTICS_QUERY_KEY_ROOT, "totals", id ?? "none"];
}

/**
 * Base options for prefetch / `useAccountTotalsQuery`.
 * `staleTime` follows `GLOBAL_CONFIG.DEFAULT_ARCHIVE_REFRESH_PERIOD` (**hours**).
 * @param {string|number|null|undefined} typeID
 */
export function totalsQueryOptions(typeID) {
  const id = normalizeTotalsTypeID(typeID);

  return {
    queryKey: totalsQueryKey(typeID),
    queryFn: async () => {
      if (!id) return null;
      return getAccountTotalsByTypeID(id);
    },
    staleTime: GLOBAL_CONFIG.DEFAULT_ARCHIVE_REFRESH_PERIOD * 60 * 60 * 1000, // Convert hours to milliseconds
    refetchOnWindowFocus: false,
  };
}

/**
 * Lifetime totals for one blueprint/item type (app backend, JWT).
 *
 * @param {string|number|null|undefined} typeID - EVE type ID
 * @param {{ enabled?: boolean }} [options] - Optional `enabled` (e.g. gate on dialogue open)
 */
export function useAccountTotalsQuery(typeID, { enabled: enabledOption } = {}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const id = normalizeTotalsTypeID(typeID);

  return useQuery({
    ...totalsQueryOptions(typeID),
    enabled:
      enabledOption === false
        ? false
        : (enabledOption ?? true) && !!id && isLoggedIn,
  });
}

/**
 * Warm the cache when opening a job (e.g. edit flow) so panels read from React Query.
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string|number|null|undefined} typeID
 * @returns {Promise<void>}
 */
export async function prefetchAccountTotalsQuery(queryClient, typeID) {
  const id = normalizeTotalsTypeID(typeID);
  if (!id || !useUsersStore.getState().account.isLoggedIn) return;
  await queryClient.prefetchQuery(totalsQueryOptions(typeID));
}

/**
 * Remove one totals query from the cache (no refetch). Use after logout or to force a clean slate.
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string|number|null|undefined} typeID
 */
export function removeAccountTotalsQuery(queryClient, typeID) {
  const id = normalizeTotalsTypeID(typeID);
  if (!id) return;
  queryClient.removeQueries({ queryKey: totalsQueryKey(id) });
}

/** Remove all totals queries from the cache. */
export function clearAccountTotalsQueryCache(queryClient) {
  queryClient.removeQueries({
    queryKey: ["backend", STATISTICS_QUERY_KEY_ROOT, "totals"],
  });
}

/**
 * Reset queries (clear state; inactive queries drop observers). See TanStack `QueryClient.resetQueries`.
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string|number|null|undefined} [typeID] - Omit to reset every totals query
 */
export function resetAccountTotalsQueries(queryClient, typeID) {
  if (typeID != null && typeID !== "") {
    const id = normalizeTotalsTypeID(typeID);
    if (!id) return;
    queryClient.resetQueries({ queryKey: totalsQueryKey(id) });
    return;
  }
  queryClient.resetQueries({
    queryKey: ["backend", STATISTICS_QUERY_KEY_ROOT, "totals"],
  });
}
