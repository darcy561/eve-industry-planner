import { useEffect, useState } from "react";
import { useAssetHelperHooks } from "../../../../Hooks/AssetHooks/useAssetHelper";
import { AssetsPage_Loading } from "../../Character Assets/Standard Layout/loadingPage";
import { AssetEntry_TopLevel } from "../../Character Assets/Standard Layout/AssetFolders/topLevelFolder";
import uuid from "react-uuid";
import getWorldData from "../../../../Functions/EveESI/World/getWorldData";
import getAssetLocationNames from "../../../../Functions/EveESI/World/getAssetLocationNames";
import { getFullItemList } from "../../../../Functions/Helper/getCachedData";
import useUsersStore from "../../../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { getAllCachedCorporationBlueprints } from "../../../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";
import {
  getCachedSingleCorporationAssets,
  useGetSingleCorporationAssets,
} from "../../../../Hooks/EveEsi/useGetSingleCorporationAssets";
import { useGetAllCorporationBlueprints } from "../../../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";

export function AssetLocationFlagPage_Corporation({
  selectedCorporation,
  assetLocationFlagRequest,
}) {
  const users = useUsersStore((state) => state.users.userArray);
  const setCorporationOffices =
    useUsersStore.getState().users.actions.setCorporationOffices;
  const [topLevelAssets, updateTopLevelAssets] = useState(null);
  const [assetLocations, updateAssetLocations] = useState(null);
  const [assetLocationNames, updateAssetLocationNames] = useState(null);
  const [fullItemList, setFullItemList] = useState(null);
  const [corporationBlueprintsMap, updateCorporationBlueprintsMap] =
    useState(null);
  const { buildAssetLocationFlagMaps, sortLocationMapsAlphabetically } =
    useAssetHelperHooks();
  const queryClient = useQueryClient();

  const { isLoading: isLoadingAssets, isError: isErrorAssets } =
    useGetSingleCorporationAssets(selectedCorporation);
  const { isLoading: isLoadingBlueprints, isError: isErrorBlueprints } =
    useGetAllCorporationBlueprints(selectedCorporation);

  const matchedCorporation = useUsersStore(
    (state) => state.users.corporationObjects[selectedCorporation]
  );

  const isLoading = isLoadingAssets || isLoadingBlueprints;
  const isError = isErrorAssets || isErrorBlueprints;

  useEffect(() => {
    async function buildCorporationAssetsTree() {
      if (!matchedCorporation || isLoading || isError) {
        return;
      }

      const requiredUserObject = users.find(
        (i) => i.corporation_id === selectedCorporation
      );
      const fullItemListData = await getFullItemList();

      const { data: corporationAssets } = getCachedSingleCorporationAssets(
        queryClient,
        selectedCorporation
      );

      setCorporationOffices(selectedCorporation, corporationAssets);

      const corporationBlueprintsMap = new Map();

      const { data: corporationBlueprints } =
        getAllCachedCorporationBlueprints(queryClient);

      Object.values(corporationBlueprints[selectedCorporation]).forEach(
        (blueprint) => {
          corporationBlueprintsMap.set(blueprint.item_id, blueprint);
        }
      );

      const { topLevelAssetLocations, assetsByLocationMap, assetIDSet } =
        buildAssetLocationFlagMaps(corporationAssets, assetLocationFlagRequest);

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
        assetIDSet,
        "corporation"
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
      updateCorporationBlueprintsMap(corporationBlueprintsMap);
      updateAssetLocations(assetsByLocationMap);
      setFullItemList(fullItemListData);
    }
    buildCorporationAssetsTree();
  }, [selectedCorporation, isLoading, isError]);

  if (!assetLocations || !topLevelAssets || isLoading || isError)
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
            characterBlueprintsMap={corporationBlueprintsMap}
            depth={depth}
            fullItemList={fullItemList}
          />
        );
      })}
    </>
  );
}
