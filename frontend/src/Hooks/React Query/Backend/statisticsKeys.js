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
