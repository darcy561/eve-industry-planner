import { useMemo } from "react";
import useAssetIndex from "./useAssetIndex";
import useAssetContainerNames from "./useAssetContainerNames";
import { useItemList } from "../Static/useItems";
import { namedContainerIds } from "../../Functions/Assets/assetTree";

/**
 * The parts every asset view is drawn from, whatever shape it arranges them into: the collection
 * itself, what each item is called, and the names their owner gave the containers.
 *
 * @param {{
 *   assets: {scope: string, id?: string|number},
 *   namesCharacter?: Object,
 *   namesScope?: string,
 *   enabled?: boolean
 * }} request
 * @returns {{collection: import("../../Functions/Assets/buildAssetNodes").AssetCollection, itemRecords: Object, containerNames: Map<number, {name: string}>, isLoading: boolean, isError: boolean, error: Error|null}}
 */
export default function useAssetSource({
  assets,
  namesCharacter,
  namesScope = "character",
  enabled = true,
}) {
  const {
    data: collection,
    isLoading: assetsLoading,
    isError,
    error,
  } = useAssetIndex({ ...assets, enabled });

  const {
    records: itemRecords,
    isLoading: itemListLoading,
    isError: itemListError,
    error: itemListErrorValue,
  } = useItemList();

  const containerIds = useMemo(
    () => namedContainerIds(collection),
    [collection],
  );
  const { names: containerNames } = useAssetContainerNames({
    character: namesCharacter,
    scope: namesScope,
    itemIds: containerIds,
    enabled,
  });

  return {
    collection,
    itemRecords,
    containerNames,
    // What a row is called comes from a static file rather than ESI, and a view cannot draw a row
    // without it — so its failure is this collection's failure, not a slower load.
    isLoading: assetsLoading || itemListLoading,
    isError: isError || itemListError,
    error: error ?? itemListErrorValue ?? null,
  };
}
