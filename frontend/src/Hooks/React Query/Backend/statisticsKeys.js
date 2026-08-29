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
    queryKey: ["backend", STATISTICS_QUERY_KEY_ROOT],
  });
}
