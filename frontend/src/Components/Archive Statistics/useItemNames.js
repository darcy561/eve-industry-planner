import { useEffect, useState } from "react";
import { getFullItemList } from "../../Functions/Helper/getCachedData";

/**
 * Item names for the rows on screen. The endpoint returns type ids; names come
 * from the cached static list, read the way the rest of the app reads it.
 *
 * @param {{typeID: number}[]} items
 */
export function useItemNames(items) {
  const [names, setNames] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return undefined;

    getFullItemList()
      .then((list) => {
        if (cancelled || !list) return;
        setNames(
          Object.fromEntries(
            items.map(({ typeID }) => [
              typeID,
              list[typeID]?.name ?? `Type ${typeID}`,
            ]),
          ),
        );
      })
      .catch(() => {
        // A missing name is cosmetic; the figures still read correctly against
        // the type id.
      });

    return () => {
      cancelled = true;
    };
  }, [items]);

  return names;
}

