import { useMemo } from "react";
import useAssetIndex, { ASSET_SCOPE } from "./useAssetIndex";
import useLocationNames from "./useLocationNames";
import assetLocationIds from "../../Functions/Assets/assetLocationIds";
import { locationOptions } from "../../Functions/Assets/assetTree";

/**
 * The named locations a scope's assets sit at, ready for a dropdown.
 *
 * Three dropdowns offer this list and each held its own copy of the rules — which location kinds
 * count, how an unreadable structure is treated, and what order they come in. They read it from
 * here instead, so a location offered on one is offered on all of them. `locationOptions` owns what
 * is offered and in what order.
 *
 * A location whose name lookup did not settle is offered under a label saying so. Every caller here
 * holds its choice somewhere that outlives the list — a stored default station, a dialogue's
 * selection — and a place missing from the list reads as no choice at all while that stored id still
 * stands.
 *
 * @param {{scope?: string, id?: string|number, enabled?: boolean}} [request]
 * @returns {{locations: Array<{locationId: number, name: string, unreadable: boolean}>, isLoading: boolean, isError: boolean}}
 */
export default function useAssetLocations({
  scope = ASSET_SCOPE.CHARACTERS,
  id,
  enabled = true,
} = {}) {
  const {
    data: collection,
    isLoading: assetsLoading,
    isError: assetsError,
  } = useAssetIndex({ scope, id, enabled });

  const locationIds = useMemo(
    () => (enabled ? assetLocationIds(collection) : []),
    [collection, enabled],
  );

  const {
    names,
    failed,
    isLoading: namesLoading,
    isError: namesError,
  } = useLocationNames(locationIds);

  const locations = useMemo(
    () => locationOptions(locationIds, names, failed),
    [locationIds, names, failed],
  );

  return {
    locations,
    isLoading: assetsLoading || namesLoading,
    isError: assetsError || namesError,
  };
}
