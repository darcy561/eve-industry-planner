/**
 * TanStack Query v5 loading detection for cache readers and useQueries combines.
 *
 * v5 uses status pending | error | success. Observer `isLoading` is only true while
 * isPending && isFetching, so a query can be pending with `isLoading === false`.
 * Disabled queries (`enabled: false` when logged out) stay pending with `fetchStatus: "idle"`
 * and must not be treated as loading. Prefer `result.isLoading` over raw `isPending`.
 */

export function isQueryStateLoading(queryState) {
  if (!queryState) return true;
  if (
    queryState.fetchStatus === "fetching" ||
    queryState.fetchStatus === "paused"
  ) {
    return true;
  }
  // Disabled queries stay `pending` with `fetchStatus: "idle"` — not an in-flight load.
  if (queryState.status === "pending" && queryState.fetchStatus === "idle") {
    return false;
  }
  const status = queryState.status;
  return status === "pending" || status === "loading";
}

export function isQueryObserverResultLoading(result) {
  if (!result) return true;
  // v5: `isLoading` is true only while fetching; `isPending` alone includes disabled empty queries.
  if (typeof result.isLoading === "boolean") {
    return result.isLoading;
  }
  return Boolean(result?.isFetching) || result?.status === "loading";
}
