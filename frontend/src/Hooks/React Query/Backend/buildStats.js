import { useQuery } from "@tanstack/react-query";
import getBuildStatsByTypeID from "../../../Functions/Endpoints/Pirivate/buildStats.js";
import GLOBAL_CONFIG from "../../../global-config-app";
import useUsersStore from "../../../Zustand/usersStore";

export const BUILD_STATS_QUERY_KEY_ROOT = "buildStats";

/**
 * Key prefix every statistics view shares.
 *
 * Archiving a job queues a rebuild that recomputes an account's statistics
 * wholesale — lifetime totals, monthly timeline and per-job rows together — so a
 * write invalidates every view rather than the one item type that changed.
 * Invalidating narrowly leaves a stale dashboard beside fresh totals, which reads
 * as a backend fault rather than a cache that was not cleared.
 */
export const STATISTICS_QUERY_KEY_ROOT = "statistics";

/**
 * @param {string|number|null|undefined} typeID
 * @returns {string|null} Digits-only type ID or null
 */
export function normalizeBuildStatsTypeID(typeID) {
  if (typeID == null || typeID === "") return null;
  const id = String(typeID).trim();
  if (!id || !/^\d+$/.test(id)) return null;
  return id;
}

/**
 * React Query key for one item type's lifetime build statistics
 * (`GET /api/v1/statistics/account/totals`).
 * @param {string|number|null|undefined} typeID
 * @returns {import("@tanstack/react-query").QueryKey}
 */
export function buildStatsQueryKey(typeID) {
  const id = normalizeBuildStatsTypeID(typeID);
  return ["backend", BUILD_STATS_QUERY_KEY_ROOT, id ?? "none"];
}

/**
 * Base options for prefetch / `useBuildStatsQuery`.
 * `staleTime` follows `GLOBAL_CONFIG.DEFAULT_ARCHIVE_REFRESH_PERIOD` (**hours**).
 * @param {string|number|null|undefined} typeID
 */
export function buildStatsQueryOptions(typeID) {
  const id = normalizeBuildStatsTypeID(typeID);

  return {
    queryKey: buildStatsQueryKey(typeID),
    queryFn: async () => {
      if (!id) return null;
      return getBuildStatsByTypeID(id);
    },
    staleTime: GLOBAL_CONFIG.DEFAULT_ARCHIVE_REFRESH_PERIOD * 60 * 60 * 1000, // Convert hours to milliseconds
    refetchOnWindowFocus: false,
  };
}

/**
 * Aggregated archived build statistics for one blueprint/item type (app backend, JWT).
 *
 * @param {string|number|null|undefined} typeID - EVE type ID
 * @param {{ enabled?: boolean }} [options] - Optional `enabled` (e.g. gate on dialog open)
 */
export function useBuildStatsQuery(typeID, { enabled: enabledOption } = {}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const id = normalizeBuildStatsTypeID(typeID);

  return useQuery({
    ...buildStatsQueryOptions(typeID),
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
export async function prefetchBuildStatsQuery(queryClient, typeID) {
  const id = normalizeBuildStatsTypeID(typeID);
  if (!id || !useUsersStore.getState().account.isLoggedIn) return;
  await queryClient.prefetchQuery(buildStatsQueryOptions(typeID));
}

/**
 * Invalidate every statistics view after a write that triggers a rebuild.
 *
 * Takes no type: the rebuild recomputes the whole account, so scoping this to one
 * item type would refresh the panel the user just archived from and leave every
 * other statistics view stale.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 */
export function invalidateStatisticsQueries(queryClient) {
  queryClient.invalidateQueries({
    queryKey: ["backend", BUILD_STATS_QUERY_KEY_ROOT],
  });
  queryClient.invalidateQueries({
    queryKey: ["backend", STATISTICS_QUERY_KEY_ROOT],
  });
}

/**
 * Remove one build-stats query from the cache (no refetch). Use after logout or to force a clean slate.
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string|number|null|undefined} typeID
 */
export function removeBuildStatsQuery(queryClient, typeID) {
  const id = normalizeBuildStatsTypeID(typeID);
  if (!id) return;
  queryClient.removeQueries({ queryKey: buildStatsQueryKey(id) });
}

/** Remove all build-stats queries from the cache. */
export function clearBuildStatsQueryCache(queryClient) {
  queryClient.removeQueries({
    queryKey: ["backend", BUILD_STATS_QUERY_KEY_ROOT],
  });
}

/**
 * Reset queries (clear state; inactive queries drop observers). See TanStack `QueryClient.resetQueries`.
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string|number|null|undefined} [typeID] - Omit to reset every build-stats query
 */
export function resetBuildStatsQueries(queryClient, typeID) {
  if (typeID != null && typeID !== "") {
    const id = normalizeBuildStatsTypeID(typeID);
    if (!id) return;
    queryClient.resetQueries({ queryKey: buildStatsQueryKey(id) });
    return;
  }
  queryClient.resetQueries({
    queryKey: ["backend", BUILD_STATS_QUERY_KEY_ROOT],
  });
}
