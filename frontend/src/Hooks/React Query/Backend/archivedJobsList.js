import { useQuery } from "@tanstack/react-query";
import {
  getArchivedJobs,
  getArchivedJob,
} from "../../../Functions/Endpoints/Private/archivedJobsList";
import useUsersStore from "../../../Zustand/usersStore";
import { STATISTICS_QUERY_KEY_ROOT } from "./statisticsKeys";

/** Key prefix for reads over the archive itself, as opposed to its statistics. */
export const ARCHIVE_QUERY_KEY_ROOT = "archive";

export function archivedJobsQueryKey(options = {}) {
  return ["backend", ARCHIVE_QUERY_KEY_ROOT, "list", options];
}

export function archivedJobQueryKey(jobID) {
  return ["backend", ARCHIVE_QUERY_KEY_ROOT, "job", jobID ?? null];
}

/**
 * Invalidate everything a restore changes.
 *
 * A restore removes documents from the archive and queues a statistics rebuild,
 * so both trees go stale together. Invalidating one would leave a restored job
 * still listed, or figures that still count it.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 */
export function invalidateArchiveQueries(queryClient) {
  queryClient.invalidateQueries({
    queryKey: ["backend", ARCHIVE_QUERY_KEY_ROOT],
  });
  queryClient.invalidateQueries({
    queryKey: ["backend", STATISTICS_QUERY_KEY_ROOT],
  });
}

/**
 * A page of the account's archived jobs.
 *
 * Gated by `enabled` rather than fetching on mount: the page this feeds opens on
 * its statistics, and a list page costs a count, a find, and a second read for
 * the figures behind the rows. Most visits never open the list.
 *
 * @param {Object} [options] - filters and paging
 * @param {{enabled?: boolean}} [queryOptions]
 */
export function useArchivedJobsQuery(options = {}, { enabled } = {}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  return useQuery({
    queryKey: archivedJobsQueryKey(options),
    queryFn: () => getArchivedJobs(options),
    enabled: enabled === false ? false : (enabled ?? true) && isLoggedIn,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
}

/**
 * One archived job in full, for a row that has been expanded.
 *
 * @param {string} jobID
 * @param {{enabled?: boolean}} [queryOptions]
 */
export function useArchivedJobQuery(jobID, { enabled } = {}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

  return useQuery({
    queryKey: archivedJobQueryKey(jobID),
    queryFn: () => getArchivedJob(jobID),
    enabled:
      enabled === false ? false : (enabled ?? true) && isLoggedIn && !!jobID,
    refetchOnWindowFocus: false,
  });
}
