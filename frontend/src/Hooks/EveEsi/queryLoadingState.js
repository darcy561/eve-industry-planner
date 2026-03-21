/**
 * TanStack Query v5 loading detection for cache readers and useQueries combines.
 *
 * v5 uses status pending | error | success. Observer `isLoading` is only true while
 * isPending && isFetching, so a query can be pending with `isLoading === false`.
 * Code that only checked `isLoading` or `status === "loading"` could treat empty
 * cache as a finished successful load.
 */

export function isQueryStateLoading(queryState) {
  if (!queryState) return true;
  const status = queryState.status;
  return status === "pending" || status === "loading";
}

export function isQueryObserverResultLoading(result) {
  return (
    Boolean(result?.isLoading) ||
    Boolean(result?.isPending) ||
    result?.status === "pending" ||
    result?.status === "loading"
  );
}
