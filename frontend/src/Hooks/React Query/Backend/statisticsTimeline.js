import { useQuery } from "@tanstack/react-query";
import {
  getAccountTimeline,
  getAccountTimelineItems,
} from "../../../Functions/Endpoints/Private/statisticsTimeline.js";
import GLOBAL_CONFIG from "../../../global-config-app";
import useUsersStore from "../../../Zustand/usersStore";
import { statisticsQueryScope } from "./statisticsKeys.js";

/**
 * Stale time for every statistics view, in milliseconds.
 *
 * Follows the archive refresh period the lifetime totals already use: all three
 * views are produced by the same rebuild, so refetching one sooner than another
 * would show a month that disagrees with the totals beside it.
 */
const STATISTICS_STALE_TIME_MS =
  GLOBAL_CONFIG.DEFAULT_ARCHIVE_REFRESH_PERIOD * 60 * 60 * 1000;

/**
 * Normalises the range and filter into a stable key fragment.
 *
 * The window is part of the key because the server chooses it when the caller
 * does not: two components asking for "the default" and "the last six months"
 * must not share a cache entry.
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number}} [options]
 */
function rangeKeyPart({ from, to, range, typeID, includeProductionChain } = {}) {
  return {
    // An all-time read is its own window, not a default one, so it caches apart
    // from both.
    range: range ?? "window",
    from: from ?? "default",
    to: to ?? "default",
    typeID: typeID == null || typeID === "" ? "all" : String(typeID),
    // Part of the key because it changes the figures, so a view counting chain
    // output is not served a cached response that excluded it.
    chain: Boolean(includeProductionChain),
  };
}

/**
 * React Query key for the monthly timeline
 * (`GET /api/v1/statistics/{owner}/timeline`).
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number}} [options]
 * @returns {import("@tanstack/react-query").QueryKey}
 */
export function timelineQueryKey(options = {}) {
  return [...statisticsQueryScope(), "timeline", rangeKeyPart(options)];
}

/**
 * React Query key for the per-item breakdown
 * (`GET /api/v1/statistics/{owner}/timeline/items`).
 *
 * Paging and ordering are part of the key: the server ranks and pages, so a
 * different sort or page is a different response rather than a re-slice of one
 * already cached.
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number, sort?: string, order?: string, limit?: number, offset?: number}} [options]
 * @returns {import("@tanstack/react-query").QueryKey}
 */
export function timelineItemsQueryKey(options = {}) {
  const { sort, order, limit, offset } = options;
  return [
    ...statisticsQueryScope(),
    "timelineItems",
    {
      ...rangeKeyPart(options),
      sort: sort ?? "default",
      order: order ?? "desc",
      limit: limit ?? "default",
      offset: offset ?? 0,
    },
  ];
}

/**
 * Base options for prefetch / `useAccountTimelineQuery`.
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number}} [options]
 */
export function timelineQueryOptions(options = {}) {
  return {
    queryKey: timelineQueryKey(options),
    queryFn: () => getAccountTimeline(options),
    staleTime: STATISTICS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  };
}

/**
 * Base options for prefetch / `useAccountTimelineItemsQuery`.
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number, sort?: string, order?: string, limit?: number, offset?: number}} [options]
 */
export function timelineItemsQueryOptions(options = {}) {
  return {
    queryKey: timelineItemsQueryKey(options),
    queryFn: () => getAccountTimelineItems(options),
    staleTime: STATISTICS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    // The previous page stays visible while the next loads, so paging does not
    // blank the table between requests.
    placeholderData: (previous) => previous,
  };
}

/**
 * Monthly figures for the signed-in account.
 *
 * With no range this is the current month and the one before it — the
 * month-on-month comparison — and `data.period.defaulted` reports that the
 * server chose the window. `month.complete` is false for the month still in
 * progress, which a comparison must label rather than show as a decline.
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number}} [options]
 * @param {{enabled?: boolean}} [queryOptions]
 */
export function useAccountTimelineQuery(options = {}, { enabled } = {}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  return useQuery({
    ...timelineQueryOptions(options),
    enabled: enabled === false ? false : (enabled ?? true) && isLoggedIn,
  });
}

/**
 * The per-item breakdown of the same window, ranked and paged by the server.
 *
 * `data.paging.totalItems` is every item type in the window, not the page
 * length, so a caller can page without a second request for the count.
 *
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number, sort?: string, order?: string, limit?: number, offset?: number}} [options]
 * @param {{enabled?: boolean}} [queryOptions]
 */
export function useAccountTimelineItemsQuery(options = {}, { enabled } = {}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  return useQuery({
    ...timelineItemsQueryOptions(options),
    enabled: enabled === false ? false : (enabled ?? true) && isLoggedIn,
  });
}

/**
 * Warm the cache for the default month-on-month window.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {{from?: string, to?: string, range?: "all", typeID?: string|number}} [options]
 */
export async function prefetchAccountTimelineQuery(queryClient, options = {}) {
  if (!useUsersStore.getState().account.isLoggedIn) return;
  await queryClient.prefetchQuery(timelineQueryOptions(options));
}
