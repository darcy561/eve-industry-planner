import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Re-renders the caller whenever anything in the React Query cache changes.
 *
 * For a surface that reads the cache directly — `getQueryState` and the like — rather than through
 * `useQuery`. Reading it without this sees whatever the cache held on the render that happened to
 * take the reading: a fetch finishing a moment later changes nothing on screen.
 *
 * Subscribing rather than observing the queries is the point: an observer would make the queries
 * run, and a collection the application deliberately does not prefetch must not be fetched merely
 * because something displays its state.
 *
 * @param {object} queryClient - React Query client instance
 * @returns {number} a value that changes on every cache event
 */
export function useQueryCacheRevision(queryClient) {
  const revision = useRef(0);

  const subscribe = useCallback(
    (onChange) =>
      queryClient.getQueryCache().subscribe(() => {
        revision.current += 1;
        onChange();
      }),
    [queryClient],
  );

  return useSyncExternalStore(subscribe, () => revision.current);
}
