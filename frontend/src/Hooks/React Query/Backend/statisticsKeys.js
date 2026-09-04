import { currentOwnerHandle } from "../../../Functions/Endpoints/Private/statisticsOwner.js";

/**
 * Key prefix every statistics view shares.
 *
 * Archiving a job moves lifetime totals, the monthly timeline and the per-job
 * rows together, so a write invalidates every view rather than the one item type
 * that changed. Invalidating narrowly leaves a stale dashboard beside fresh
 * totals, which reads as a backend fault rather than a cache that was not
 * cleared.
 */
export const STATISTICS_QUERY_KEY_ROOT = "statistics";

/**
 * The prefix every statistics key carries: the root, then whose figures they are.
 *
 * Two planners' figures are different data under the same view, so the owner
 * belongs in the key rather than in the query function alone — without it the
 * first shared planner would read a cache entry filled for another owner.
 * Invalidation still reaches everything through the root above it.
 */
export function statisticsQueryScope() {
  return ["backend", STATISTICS_QUERY_KEY_ROOT, currentOwnerHandle()];
}
