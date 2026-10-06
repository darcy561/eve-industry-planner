import { useEffect, useSyncExternalStore } from "react";

/**
 * A static file held for reading without awaiting, read so the view redraws when it arrives or is
 * dropped for a new build, and loaded again whenever it is found dropped.
 *
 * @template T
 * @param {{subscribe: (listener: () => void) => () => void, read: () => T|null,
 *   prime: () => Promise<void>}} file
 * @returns {T|null}
 */
export function useHeldStaticFile({ subscribe, read, prime }) {
  const contents = useSyncExternalStore(subscribe, read);

  useEffect(() => {
    if (contents === null) prime().catch(() => {});
  }, [contents, prime]);

  return contents;
}
