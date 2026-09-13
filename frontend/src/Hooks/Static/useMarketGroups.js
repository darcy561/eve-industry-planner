import { useMemo } from "react";
import { useCachedData } from "../App/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import {
  ancestorPathIn,
  childrenIn,
} from "../../Functions/MarketData/marketGroupData";

const EMPTY_TREE = {};

/**
 * The market group tree, keyed by group id.
 *
 * One cache entry for the whole file, as the item list is: the tree arrives as a
 * single static download and a group's place in it never changes while the app is
 * open, so a caller reads the map and indexes it.
 *
 * @returns {{groups: Object<string, Object>, isLoading: boolean, isError: boolean, error: Error|null}}
 */
export function useMarketGroupTree() {
  const { data, isLoading, isError, error } = useCachedData(
    CACHED_DATA_FILES.MARKET_GROUPS,
  );

  return {
    groups: data ?? EMPTY_TREE,
    isLoading,
    isError,
    error: error ?? null,
  };
}

/**
 * What contains a group, outermost first, ending with the group itself.
 *
 * Walks the tree this hook read rather than the copy the pricing rung holds: the
 * two are primed separately, so reading one to decide the other is ready would be
 * a race. The walk itself is shared, so a path shown to a reader and a price
 * resolved for a row cannot disagree about parentage.
 *
 * @param {number|null|undefined} groupID
 * @returns {Array<{id: number, name: string}>}
 */
export function useAncestorPath(groupID) {
  const { groups } = useMarketGroupTree();

  return useMemo(() => ancestorPathIn(groups, groupID), [groups, groupID]);
}

/**
 * What sits directly inside a group, or at the top of the tree.
 *
 * @param {number|null} [parentID] - null or omitted for the roots
 * @returns {Array<{id: number, name: string, hasChildren: boolean, hasTypes: boolean}>}
 */
export function useMarketGroupChildren(parentID = null) {
  const { groups } = useMarketGroupTree();

  return useMemo(() => childrenIn(groups, parentID), [groups, parentID]);
}
