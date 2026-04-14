import { useEffect, useState } from "react";
import { useAssetHelperHooks } from "../../../../Hooks/AssetHooks/useAssetHelper";
import { AssetEntry_TopLevel } from "./AssetFolders/topLevelFolder";
import { AssetsPage_Loading } from "./loadingPage";
import getWorldData from "../../../../Functions/EveESI/World/getWorldData";
import getAssetLocationNames from "../../../../Functions/EveESI/World/getAssetLocationNames";
import { getFullItemList } from "../../../../Functions/Helper/getCachedData";
import useUsersStore from "../../../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedCharacterBlueprints } from "../../../../Hooks/EveEsi/Character/useGetCharacterBlueprints";
import { getCachedCharacterAssets } from "../../../../Hooks/EveEsi/Character/useGetCharacterAssets";
import { useGetCharacterAssets } from "../../../../Hooks/EveEsi/Character/useGetCharacterAssets";

export function AssetsPage_Character({ selectedCharacter }) {
  const [topLevelAssets, updateTopLevelAssets] = useState(null);
  const [assetLocations, updateAssetLocations] = useState(null);
  const [assetLocationNames, updateAssetLocationNames] = useState(null);
  const [characterBlueprintsMap, updateCharacterBlueprintsMap] = useState(null);
  const [fullItemList, setFullItemList] = useState(null);
  const { buildAssetMaps, sortLocationMapsAlphabetically } =
    useAssetHelperHooks();
  const queryClient = useQueryClient();

  const { isLoading: isLoadingAssets, isError: isErrorAssets } =
    useGetCharacterAssets(selectedCharacter);

  useEffect(() => {
    async function buildCharacterAssetsTree() {
      // Early return if no selectedCharacter or data is still loading
      if (!selectedCharacter || isLoadingAssets || isErrorAssets) {
        return;
      }

      const requiredUserObject = useUsersStore
        .getState()
        .account.actions.findCharacterByHash(selectedCharacter);

      const fullItemListData = await getFullItemList();

      const { data: characterBlueprints } = getCachedCharacterBlueprints(
        queryClient,
        selectedCharacter
      );
      const blueprintsMap = new Map(
        characterBlueprints?.data?.map((i) => [i.item_id, i]) || []
      );

      const assetsJSON = getCachedCharacterAssets(
        queryClient,
        selectedCharacter
      );

      const filteredAssets = assetsJSON.data.filter(
        (i) => i.location_flag !== "AssetSafety" && i.location_flag !== "Deliveries"
      );

      const { topLevelAssetLocations, assetsByLocationMap, assetIDSet } =
        buildAssetMaps(filteredAssets);

      const requiredLocationID = [...topLevelAssetLocations.keys()].reduce(
        (prev, locationID) => {
          const matchedID = useUsersStore.getState().worldData.actions.findUniverseData(locationID);
          if (!matchedID) {
            prev.add(locationID);
          }
          return prev;
        },
        new Set()
      );

      const locationNamesMap = await getAssetLocationNames(
        requiredUserObject,
        assetIDSet
      );

      const additionalIDObjects = await getWorldData(
        requiredLocationID,
        requiredUserObject
      );

      const topLevelAssetLocationsSORTED = sortLocationMapsAlphabetically(
        topLevelAssetLocations,
        additionalIDObjects
      );

      if (Object.keys(additionalIDObjects).length > 0) {
        useUsersStore.getState().worldData.actions.addUniverseIDs(additionalIDObjects);
      }

      updateAssetLocationNames(locationNamesMap);
      updateTopLevelAssets(topLevelAssetLocationsSORTED);
      updateAssetLocations(assetsByLocationMap);
      updateCharacterBlueprintsMap(blueprintsMap);
      setFullItemList(fullItemListData);
    }
    buildCharacterAssetsTree();
  }, [selectedCharacter, isLoadingAssets, isErrorAssets]);

  if (
    !assetLocations ||
    !topLevelAssets ||
    !assetLocationNames ||
    !characterBlueprintsMap ||
    isLoadingAssets ||
    isErrorAssets
  )
    return <AssetsPage_Loading />;

  return (
    <>
      {Array.from(topLevelAssets).map(([locationID, assets], index) => {
        let depth = 1;
        return (
          <AssetEntry_TopLevel
            key={locationID}
            locationID={locationID}
            assets={assets}
            assetLocations={assetLocations}
            topLevelAssets={topLevelAssets}
            assetLocationNames={assetLocationNames}
            characterBlueprintsMap={characterBlueprintsMap}
            depth={depth}
            index={index}
            fullItemList={fullItemList}
          />
        );
      })}
    </>
  );
}
