import { useEffect, useState } from "react";
import { useAssetHelperHooks } from "../../../../Hooks/AssetHooks/useAssetHelper";
import { AssetsPage_Loading } from "./loadingPage";
import { AssetEntry_TopLevel } from "./AssetFolders/topLevelFolder";
import uuid from "react-uuid";
import getWorldData from "../../../../Functions/EveESI/World/getWorldData";
import getAssetLocationNames from "../../../../Functions/EveESI/World/getAssetLocationNames";
import { getFullItemList } from "../../../../Functions/Helper/getCachedData";
import useUsersStore from "../../../../Zustand/usersStore";
import { useGetCharacterAssets } from "../../../../Hooks/EveEsi/Character/useGetCharacterAssets";
import { getCachedCharacterAssets } from "../../../../Hooks/EveEsi/Character/useGetCharacterAssets";
import { useQueryClient } from "@tanstack/react-query";

export function AssetLocationFlagPage_Character({
  selectedCharacter,
  assetLocationFlagRequest,
}) {
  const [topLevelAssets, updateTopLevelAssets] = useState(null);
  const [assetLocations, updateAssetLocations] = useState(null);
  const [assetLocationNames, updateAssetLocationNames] = useState(null);
  const [fullItemList, setFullItemList] = useState(null);
  const { buildAssetLocationFlagMaps, sortLocationMapsAlphabetically } =
    useAssetHelperHooks();
  const queryClient = useQueryClient();

  const { isLoading: isLoadingAssets, isError: isErrorAssets } =
    useGetCharacterAssets(selectedCharacter);

  useEffect(() => {
    async function buildCharacterAssetsTree() {
      const requiredUserObject = useUsersStore
        .getState()
        .users.actions.findUserByCharacterHash(selectedCharacter);
      const fullItemListData = await getFullItemList();

      const { data: characterAssets } = getCachedCharacterAssets(
        queryClient,
        selectedCharacter
      );

      const { topLevelAssetLocations, assetsByLocationMap, assetIDSet } =
        buildAssetLocationFlagMaps(characterAssets, assetLocationFlagRequest);

      const requiredLocationID = [...topLevelAssetLocations.keys()].reduce(
        (prev, locationID) => {
          const matchedID = useUsersStore
            .getState()
            .worldData.actions.findUniverseData(locationID);

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
      setFullItemList(fullItemListData);
    }
    buildCharacterAssetsTree();
  }, [selectedCharacter, assetLocationFlagRequest]);

  if (!assetLocations || !topLevelAssets || isLoadingAssets || isErrorAssets)
    return <AssetsPage_Loading />;

  return (
    <>
      {Array.from(topLevelAssets).map(([locationID, assets]) => {
        let depth = 1;
        return (
          <AssetEntry_TopLevel
            key={uuid()}
            locationID={locationID}
            assets={assets}
            assetLocations={assetLocations}
            topLevelAssets={topLevelAssets}
            assetLocationNames={assetLocationNames}
            depth={depth}
            fullItemList={fullItemList}
          />
        );
      })}
    </>
  );
}
