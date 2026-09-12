import { useMemo } from "react";
import useAssetIndex, { ASSET_SCOPE } from "./useAssetIndex";
import useLocationNames from "./useLocationNames";
import { locationOptions } from "../../Functions/Assets/assetTree";
import blueprintLocations from "../../Functions/Blueprints/blueprintLocations";
import { unnameableLocationIds } from "../../Functions/Assets/assetLocationIds";
import { asNumberIDSet } from "../../Functions/Helper/ids";

const EMPTY_NAMES = new Map();

/**
 * What each blueprint's location is called.
 *
 * A corporation's assets are the largest thing the app fetches, and the library asks for every
 * scope's. The library holds its results back until this has settled rather than drawing labels in
 * one at a time as each scope lands.
 *
 * @param {import("../../Functions/Blueprints/buildBlueprintRows").BlueprintCollection} blueprints
 * @returns {{names: Map<number, string>, places: Array<{locationId: number, name: string}>, locationIds: Map<number, number>, isLoading: boolean, isError: boolean, error: Error|null}} names and locations keyed by blueprint `itemId`, and the distinct places in display order
 */
export default function useBlueprintLocations(blueprints) {
  const {
    data: assets,
    isLoading: assetsLoading,
    isError: assetsError,
    error: assetsErrorValue,
  } = useAssetIndex({ scope: ASSET_SCOPE.ALL });

  const locationIds = useMemo(
    () => blueprintLocations(blueprints, assets),
    [blueprints, assets],
  );

  // A blueprint aboard a ship in space holds the ship's item id, which no lookup will ever name.
  const requested = useMemo(() => {
    const ships = unnameableLocationIds(assets);
    return [...asNumberIDSet(locationIds.values())].filter(
      (id) => !ships.has(id),
    );
  }, [locationIds, assets]);
  const {
    names,
    failed,
    isLoading: namesLoading,
    isError: namesError,
    error: namesErrorValue,
  } = useLocationNames(requested);

  const byItemId = useMemo(() => {
    if (locationIds.size === 0) return EMPTY_NAMES;

    const found = new Map();
    for (const [itemId, locationId] of locationIds) {
      const name = names[locationId]?.name;
      if (name) found.set(itemId, name);
    }
    return found;
  }, [locationIds, names]);

  // The places blueprints are held at, for narrowing the library to one of them. The same picker
  // component is fed from `useAssetLocations`, so both feeds order and describe a place the same
  // way — a structure nobody can read is offered saying so, after the named ones.
  //
  // A place whose lookup did not settle is offered too: the chosen one lives in the URL, and a place
  // missing from this list reads as no choice at all while the library stays narrowed to it.
  const places = useMemo(
    () => locationOptions(asNumberIDSet(locationIds.values()), names, failed),
    [locationIds, names, failed],
  );

  // A failure reads the same as a blueprint simply having no location, so it is reported rather
  // than left to look like an answer.
  return {
    names: byItemId,
    places,
    locationIds,
    isLoading: assetsLoading || namesLoading,
    isError: assetsError || namesError,
    error: assetsErrorValue ?? namesErrorValue ?? null,
  };
}
