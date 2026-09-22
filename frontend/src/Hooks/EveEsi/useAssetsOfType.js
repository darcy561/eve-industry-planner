import { useMemo } from "react";
import useAssetSource from "./useAssetSource";
import useLocationNames, { charactersByLocation } from "./useLocationNames";
import assetsOfType from "../../Functions/Assets/assetsOfType";
import {
  assetLocationCharacters,
  unnameableLocationIds,
} from "../../Functions/Assets/assetLocationIds";
import { orderLocations } from "../../Functions/Assets/assetTree";

const EMPTY_LOCATIONS = [];

/**
 * Where one type is held, ready to render: the locations in display order and, at each, the chain
 * of containers down to the stacks.
 *
 * @param {{
 *   assets: {scope: string, id?: string|number},
 *   typeId?: number,
 *   namesCharacter?: Object,
 *   namesScope?: string,
 *   enabled?: boolean
 * }} request
 */
export default function useAssetsOfType({
  assets,
  typeId,
  namesCharacter,
  namesScope,
  enabled = true,
}) {
  const { collection, containerNames, isLoading, isError, error } =
    useAssetSource({ assets, namesCharacter, namesScope, enabled });

  const byLocation = useMemo(
    () => (enabled ? assetsOfType(collection, typeId) : new Map()),
    [enabled, collection, typeId],
  );

  const shipIds = useMemo(
    () => unnameableLocationIds(collection),
    [collection],
  );

  const locationIds = useMemo(
    () => [...byLocation.keys()].filter((id) => !shipIds.has(id)),
    [byLocation, shipIds],
  );
  const holders = useMemo(
    () => charactersByLocation(assetLocationCharacters(collection)),
    [collection],
  );

  const {
    names: locationNames,
    failed: unresolvedLocations,
    isLoading: namesLoading,
  } = useLocationNames(locationIds, holders);

  const locations = useMemo(
    () =>
      enabled
        ? orderLocations(byLocation, locationNames, unresolvedLocations)
        : EMPTY_LOCATIONS,
    [enabled, byLocation, locationNames, unresolvedLocations],
  );

  return {
    locations,
    collection,
    containerNames,
    isLoading: isLoading || namesLoading,
    isError,
    error,
  };
}
