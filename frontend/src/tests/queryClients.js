import { QueryClient } from "@tanstack/react-query";

/**
 * The React Query clients a test renders against.
 *
 * A client built with no options retries a failed query on the library's own
 * schedule, so a test that expects a failure waits seconds for it rather than
 * seeing it at once. Which option stops that depends on the query, which is why
 * there is more than one of these: pick by what the test needs, rather than by
 * whichever line was nearest to copy.
 */

/**
 * The usual one: a failing query fails the test immediately rather than being
 * retried.
 *
 * @returns {QueryClient}
 */
export function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

/**
 * For a query that asks for retries itself.
 *
 * A `retry` set on the query outlives a client default, so `retry: false` does
 * nothing to it and the test would wait out the real schedule. This collapses
 * the wait between attempts instead, leaving the attempts themselves in place —
 * which is what the test is usually about.
 *
 * @returns {QueryClient}
 */
export function testQueryClientCollapsingRetries() {
  return new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
}

/**
 * For a test where the client is the only place the answer lives — a resolved
 * name seeded with `setQueryData`, or a cache that has to survive a rerender.
 *
 * Without `gcTime` an entry with no observer is collected as soon as the
 * component unmounts, so what the test seeded is gone before it looks.
 *
 * @returns {QueryClient}
 */
export function testQueryClientKeepingCache() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}
