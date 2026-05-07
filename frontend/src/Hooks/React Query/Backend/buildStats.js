import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import getBuildStatsByTypeID from "../../../Functions/Endpoints/Pirivate/buildStats.js";
import getBuildStatsSnapshotsByTypeID from "../../../Functions/Endpoints/Pirivate/buildStatsSnapshots.js";
import getBuildStatsTimelineByTypeID from "../../../Functions/Endpoints/Pirivate/buildStatsTimeline.js";
import getCorpBuildStats from "../../../Functions/Endpoints/Pirivate/corpBuildStats.js";
import getCorpBuildStatsTimeline from "../../../Functions/Endpoints/Pirivate/corpBuildStatsTimeline.js";
import GLOBAL_CONFIG from "../../../global-config-app";
import useUsersStore from "../../../Zustand/usersStore";

export const BUILD_STATS_QUERY_KEY_ROOT = "buildStats";
export const BUILD_STATS_SNAPSHOTS_QUERY_KEY_ROOT = "buildStatsSnapshots";
export const BUILD_STATS_TIMELINE_QUERY_KEY_ROOT = "buildStatsTimeline";
export const CORP_BUILD_STATS_QUERY_KEY_ROOT = "corpBuildStats";
export const CORP_BUILD_STATS_TIMELINE_QUERY_KEY_ROOT = "corpBuildStatsTimeline";

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
 * React Query key for Mongo-backed build stats (`GET /api/v1/statistics/build-stats`).
 * @param {string|number|null|undefined} typeID
 * @returns {import("@tanstack/react-query").QueryKey}
 */
export function buildStatsQueryKey(typeID) {
  const id = normalizeBuildStatsTypeID(typeID);
  return ["backend", BUILD_STATS_QUERY_KEY_ROOT, id ?? "none"];
}

/**
 * @param {string|number|null|undefined} typeID
 * @param {{ scope?: 'personal' | 'corp', corporationId?: string|number|null }} [options]
 */
export function buildStatsSnapshotsQueryKey(typeID, options = {}) {
  const id = normalizeBuildStatsTypeID(typeID);
  const base = ["backend", BUILD_STATS_SNAPSHOTS_QUERY_KEY_ROOT, id ?? "none"];
  if (options.scope === "corp") {
    const corpID = normalizeBuildStatsTypeID(options.corporationId);
    return [...base, "corp", corpID ?? "none"];
  }
  return [...base, "personal"];
}

/**
 * @param {string|number|null|undefined} typeID
 * @param {{ scope?: 'personal' | 'corp', corporationId?: string|number|null }} [options]
 */
export function buildStatsTimelineQueryKey(typeID, options = {}) {
  const id = normalizeBuildStatsTypeID(typeID);
  const base = ["backend", BUILD_STATS_TIMELINE_QUERY_KEY_ROOT, id ?? "none"];
  if (options.scope === "corp") {
    const corpID = normalizeBuildStatsTypeID(options.corporationId);
    return [...base, "corp", corpID ?? "none"];
  }
  return [...base, "personal"];
}

/**
 * Merge snapshot lists for archive UI; later arrays overwrite earlier rows with the same `jobID` (personal last wins).
 * @param {Array<Array<Record<string, unknown>>>} lists
 */
export function mergeArchiveSnapshotsPersonalWins(lists) {
  const byJob = new Map();
  for (const rows of lists) {
    for (const doc of rows) {
      const jid = doc?.jobID;
      if (jid) {
        byJob.set(jid, doc);
      }
    }
  }
  return [...byJob.values()].sort(
    (a, b) => new Date(b.archivedAt) - new Date(a.archivedAt)
  );
}

export function corpBuildStatsQueryKey(corporationID, typeID) {
  const corpID = normalizeBuildStatsTypeID(corporationID);
  const tID = normalizeBuildStatsTypeID(typeID);
  return ["backend", CORP_BUILD_STATS_QUERY_KEY_ROOT, corpID ?? "none", tID ?? "none"];
}

export function corpBuildStatsTimelineQueryKey(corporationID, typeID) {
  const corpID = normalizeBuildStatsTypeID(corporationID);
  const tID = normalizeBuildStatsTypeID(typeID);
  return ["backend", CORP_BUILD_STATS_TIMELINE_QUERY_KEY_ROOT, corpID ?? "none", tID ?? "none"];
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
 * React-query options for per-job archived snapshots (`GET .../build-stats/snapshots`).
 * @param {string|number|null|undefined} typeID
 * @param {{ scope?: 'personal' | 'corp', corporationId?: string|number|null }} [scopeOptions]
 */
export function buildStatsSnapshotsQueryOptions(typeID, scopeOptions = {}) {
  const id = normalizeBuildStatsTypeID(typeID);
  return {
    queryKey: buildStatsSnapshotsQueryKey(typeID, scopeOptions),
    queryFn: async () => {
      if (!id) return null;
      return getBuildStatsSnapshotsByTypeID(id, scopeOptions);
    },
    staleTime: GLOBAL_CONFIG.DEFAULT_ARCHIVE_REFRESH_PERIOD * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    /** Avoid ContentPanel loading flicker when the observer briefly has no data during refetch / key transitions. */
    placeholderData: keepPreviousData,
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
 * Per-archived-job rows for one item type — `scope: 'personal'` (user collection) or `scope: 'corp'` (corp collection; requires `corporationId`).
 *
 * @param {string|number|null|undefined} typeID
 * @param {{ enabled?: boolean, scope?: 'personal' | 'corp', corporationId?: string|number|null }} [options]
 */
export function useBuildStatsSnapshotsQuery(
  typeID,
  { enabled: enabledOption, scope = "personal", corporationId } = {}
) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const id = normalizeBuildStatsTypeID(typeID);
  const scopeOpts = { scope, corporationId };

  return useQuery({
    ...buildStatsSnapshotsQueryOptions(typeID, scopeOpts),
    enabled:
      enabledOption === false
        ? false
        : (enabledOption ?? true) &&
            !!id &&
            isLoggedIn &&
            (scope !== "corp" || (corporationId != null && corporationId !== "")),
  });
}

/**
 * For the edit-job archive panel: fetches personal snapshots plus one corp-scoped request per linked corporation, then merges (personal wins on duplicate job IDs).
 * @param {string|number|null|undefined} typeID
 * @param {{ enabled?: boolean }} [options]
 */
export function useArchiveJobsSnapshotsQuery(typeID, { enabled: enabledOption } = {}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const id = normalizeBuildStatsTypeID(typeID);
  const corporations = useUsersStore((state) => state.account.corporations) ?? [];

  const corpIdList = useMemo(() => {
    const s = new Set();
    for (const c of corporations) {
      const raw = c?.corporation_id;
      if (raw == null || raw === "") {
        continue;
      }
      const n =
        typeof raw === "number" ? raw : parseInt(String(raw), 10);
      if (Number.isFinite(n) && n > 0) {
        s.add(n);
      }
    }
    return [...s];
  }, [corporations]);

  const queries = useQueries({
    queries: [
      {
        ...buildStatsSnapshotsQueryOptions(typeID, { scope: "personal" }),
        enabled:
          enabledOption !== false &&
          (enabledOption ?? true) &&
          !!id &&
          isLoggedIn,
      },
      ...corpIdList.map((corporationId) => ({
        ...buildStatsSnapshotsQueryOptions(typeID, {
          scope: "corp",
          corporationId,
        }),
        enabled:
          enabledOption !== false &&
          (enabledOption ?? true) &&
          !!id &&
          isLoggedIn,
      })),
    ],
  });

  const snapshotMergeRevision = queries.map((q) => q.dataUpdatedAt).join("|");
  const snapshots = useMemo(() => {
    const corpRows = corpIdList.map(
      (_, i) => queries[i + 1]?.data?.snapshots ?? []
    );
    const personalRows = queries[0]?.data?.snapshots ?? [];
    return mergeArchiveSnapshotsPersonalWins([...corpRows, personalRows]);
  }, [snapshotMergeRevision, corpIdList, queries]);

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const error = queries.find((q) => q.error)?.error ?? null;

  return {
    data: { snapshots },
    isLoading,
    isError,
    error,
  };
}

export function useBuildStatsTimelineQuery(
  typeID,
  { enabled: enabledOption, scope = "personal", corporationId } = {}
) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const id = normalizeBuildStatsTypeID(typeID);
  const scopeOpts = { scope, corporationId };

  return useQuery({
    queryKey: buildStatsTimelineQueryKey(typeID, scopeOpts),
    queryFn: async () => {
      if (!id) return null;
      return getBuildStatsTimelineByTypeID(id, scopeOpts);
    },
    staleTime: GLOBAL_CONFIG.DEFAULT_ARCHIVE_REFRESH_PERIOD * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled:
      enabledOption === false
        ? false
        : (enabledOption ?? true) &&
            !!id &&
            isLoggedIn &&
            (scope !== "corp" || (corporationId != null && corporationId !== "")),
  });
}

export function useCorpBuildStatsQuery(
  corporationID,
  typeID,
  { enabled: enabledOption } = {}
) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const corpID = normalizeBuildStatsTypeID(corporationID);
  const tID = normalizeBuildStatsTypeID(typeID);

  return useQuery({
    queryKey: corpBuildStatsQueryKey(corporationID, typeID),
    queryFn: async () => {
      if (!corpID || !tID) return null;
      return getCorpBuildStats(corpID, tID);
    },
    staleTime: GLOBAL_CONFIG.DEFAULT_ARCHIVE_REFRESH_PERIOD * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled:
      enabledOption === false
        ? false
        : (enabledOption ?? true) && !!corpID && !!tID && isLoggedIn,
  });
}

export function useCorpBuildStatsTimelineQuery(
  corporationID,
  typeID,
  { enabled: enabledOption } = {}
) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const corpID = normalizeBuildStatsTypeID(corporationID);
  const tID = normalizeBuildStatsTypeID(typeID);

  return useQuery({
    queryKey: corpBuildStatsTimelineQueryKey(corporationID, typeID),
    queryFn: async () => {
      if (!corpID || !tID) return null;
      return getCorpBuildStatsTimeline(corpID, tID);
    },
    staleTime: GLOBAL_CONFIG.DEFAULT_ARCHIVE_REFRESH_PERIOD * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled:
      enabledOption === false
        ? false
        : (enabledOption ?? true) && !!corpID && !!tID && isLoggedIn,
  });
}

export function invalidateCorpBuildStatsQuery(queryClient, corporationID, typeID) {
  const corpID = normalizeBuildStatsTypeID(corporationID);
  const tID = normalizeBuildStatsTypeID(typeID);
  if (!corpID || !tID) return;
  queryClient.invalidateQueries({
    queryKey: corpBuildStatsQueryKey(corpID, tID),
  });
}

export function invalidateCorpBuildStatsTimelineQuery(queryClient, corporationID, typeID) {
  const corpID = normalizeBuildStatsTypeID(corporationID);
  const tID = normalizeBuildStatsTypeID(typeID);
  if (!corpID || !tID) return;
  queryClient.invalidateQueries({
    queryKey: corpBuildStatsTimelineQueryKey(corpID, tID),
  });
}

export function invalidateAllCorpBuildStatsQueries(queryClient) {
  queryClient.invalidateQueries({
    queryKey: ["backend", CORP_BUILD_STATS_QUERY_KEY_ROOT],
  });
  queryClient.invalidateQueries({
    queryKey: ["backend", CORP_BUILD_STATS_TIMELINE_QUERY_KEY_ROOT],
  });
}

export function clearCorpBuildStatsQueryCache(queryClient) {
  queryClient.removeQueries({
    queryKey: ["backend", CORP_BUILD_STATS_QUERY_KEY_ROOT],
  });
  queryClient.removeQueries({
    queryKey: ["backend", CORP_BUILD_STATS_TIMELINE_QUERY_KEY_ROOT],
  });
}

/**
 * Warm per-job archived snapshot cache when opening a job (edit flow Archive panel).
 * Aggregate `GET .../build-stats` is not prefetched here; other UI loads it on demand.
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string|number|null|undefined} typeID
 * @returns {Promise<void>}
 */
export async function prefetchBuildStatsQuery(queryClient, typeID) {
  const id = normalizeBuildStatsTypeID(typeID);
  if (!id || !useUsersStore.getState().account.isLoggedIn) return;
  await queryClient.prefetchQuery(buildStatsSnapshotsQueryOptions(typeID));
}

/** Invalidate cached build stats for one type (e.g. after archiving that item). */
export function invalidateBuildStatsQuery(queryClient, typeID) {
  const id = normalizeBuildStatsTypeID(typeID);
  if (!id) return;
  queryClient.invalidateQueries({ queryKey: buildStatsQueryKey(id) });
  queryClient.invalidateQueries({
    queryKey: ["backend", BUILD_STATS_SNAPSHOTS_QUERY_KEY_ROOT, id],
  });
}

/** Invalidate all build-stats queries (e.g. after batch archive). */
export function invalidateAllBuildStatsQueries(queryClient) {
  queryClient.invalidateQueries({
    queryKey: ["backend", BUILD_STATS_QUERY_KEY_ROOT],
  });
  queryClient.invalidateQueries({
    queryKey: ["backend", BUILD_STATS_SNAPSHOTS_QUERY_KEY_ROOT],
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
  queryClient.removeQueries({
    queryKey: ["backend", BUILD_STATS_SNAPSHOTS_QUERY_KEY_ROOT, id],
  });
}

/** Remove all build-stats queries from the cache. */
export function clearBuildStatsQueryCache(queryClient) {
  queryClient.removeQueries({
    queryKey: ["backend", BUILD_STATS_QUERY_KEY_ROOT],
  });
  queryClient.removeQueries({
    queryKey: ["backend", BUILD_STATS_SNAPSHOTS_QUERY_KEY_ROOT],
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
    queryClient.resetQueries({
      queryKey: ["backend", BUILD_STATS_SNAPSHOTS_QUERY_KEY_ROOT, id],
    });
    return;
  }
  queryClient.resetQueries({
    queryKey: ["backend", BUILD_STATS_QUERY_KEY_ROOT],
  });
  queryClient.resetQueries({
    queryKey: ["backend", BUILD_STATS_SNAPSHOTS_QUERY_KEY_ROOT],
  });
}
