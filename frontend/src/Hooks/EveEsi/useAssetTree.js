import { useMemo } from "react";
import useAssetSource from "./useAssetSource";
import useBlueprintIndex from "./useBlueprintIndex";
import useLocationNames from "./useLocationNames";
import { unnameableLocationIds } from "../../Functions/Assets/assetLocationIds";
import {
  assetRowsByLocation,
  orderLocations,
} from "../../Functions/Assets/assetTree";
import assembledShipIds from "../../Functions/Assets/assembledShipIds";
import { isAncientRelic } from "../../Functions/Shared/itemCategories";

const EMPTY_LOCATIONS = [];

/**
 * Everything one asset view renders: its locations in display order, the rows at each, and the
 * names and blueprint state its rows are drawn with.
 *
 * The four library views differ only in which collection they read and which compartments they
 * show. Nothing here waits on anything: the parts arrive through the query cache and the view
 * renders what has arrived.
 *
 * @param {{
 *   assets: {scope: string, id?: string|number},
 *   blueprints: {scope: string, id?: string|number},
 *   namesCharacter?: Object,
 *   namesScope?: string,
 *   rootFlags?: string[],
 *   excludeRootFlags?: string[],
 *   includeLocations?: number[],
 *   hideAssembledShips?: boolean,
 *   enabled?: boolean
 * }} request
 */
export default function useAssetTree({
  assets,
  blueprints,
  namesCharacter,
  namesScope,
  rootFlags,
  excludeRootFlags,
  includeLocations,
  hideAssembledShips = false,
  enabled = true,
}) {
  const { collection, itemRecords, containerNames, isLoading, isError, error } =
    useAssetSource({ assets, namesCharacter, namesScope, enabled });

  const {
    data: blueprintCollection,
    isLoading: blueprintsLoading,
    isError: blueprintsError,
    error: blueprintsErrorValue,
  } = useBlueprintIndex(blueprints);

  // What the view leaves out. Blueprints always: they have their own library, and the blueprint
  // collection is what says which items they are. Assembled ships when the player asks, which
  // takes their fittings and cargo with them.
  //
  // ESI answers the blueprints endpoint with ancient relics too, because they carry runs the way a
  // copy does. They are invention materials rather than blueprints, so they stay in the asset view.
  const hidden = useMemo(() => {
    const itemIds = new Set();
    for (const [itemId, row] of blueprintCollection.byItemId) {
      if (isAncientRelic(itemRecords[row.typeId]?.category_id)) continue;
      itemIds.add(itemId);
    }
    if (!hideAssembledShips) return itemIds;

    for (const itemId of assembledShipIds(collection, itemRecords)) {
      itemIds.add(itemId);
    }
    return itemIds;
  }, [blueprintCollection, hideAssembledShips, collection, itemRecords]);

  // The flag and location lists are expected to be stable — a module-level constant or a memo at
  // the call site — because a fresh array each render would rebuild the whole view each render.
  const rowsByLocation = useMemo(
    () =>
      assetRowsByLocation(collection, {
        rootFlags,
        excludeRootFlags,
        includeLocations,
        excludeItemIds: hidden,
      }),
    [collection, rootFlags, excludeRootFlags, includeLocations, hidden],
  );

  const shipIds = useMemo(
    () => unnameableLocationIds(collection),
    [collection],
  );

  const locationIds = useMemo(
    () => [...rowsByLocation.keys()].filter((id) => !shipIds.has(id)),
    [rowsByLocation, shipIds],
  );
  const {
    names: locationNames,
    failed: unresolvedLocations,
    isLoading: namesLoading,
  } = useLocationNames(locationIds);

  const locations = useMemo(
    () =>
      enabled
        ? orderLocations(rowsByLocation, locationNames, unresolvedLocations)
        : EMPTY_LOCATIONS,
    [enabled, rowsByLocation, locationNames, unresolvedLocations],
  );

  return {
    locations,
    collection,
    byItemId: collection.byItemId,
    excludeItemIds: hidden,
    containerNames,
    isLoading: isLoading || blueprintsLoading || namesLoading,
    isError: isError || blueprintsError,
    error: error ?? blueprintsErrorValue ?? null,
  };
}
