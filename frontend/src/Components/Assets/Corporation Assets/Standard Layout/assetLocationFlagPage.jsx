import { useEffect, useState } from "react";
import {
  buildAssetLocationFlagMaps,
  sortLocationMapsAlphabetically,
} from "../../../../Functions/Assets/assetHelpers";
import { AssetsPage_Loading } from "../../Character Assets/Standard Layout/loadingPage";
import { AssetEntry_TopLevel } from "../../Character Assets/Standard Layout/AssetFolders/topLevelFolder";
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
  const characters = useUsersStore((state) => state.account.characters);
  const setCorporationOffices =
    useUsersStore.getState().account.actions.setCorporationOffices;
  const [topLevelAssets, updateTopLevelAssets] = useState(null);
  const [assetLocations, updateAssetLocations] = useState(null);
  const [assetLocationNames, updateAssetLocationNames] = useState(null);
  const [fullItemList, setFullItemList] = useState(null);
  const [corporationBlueprintsMap, updateCorporationBlueprintsMap] =
    useState(null);
  const queryClient = useQueryClient();

  const { isLoading: isLoadingAssets, isError: isErrorAssets } =
    useGetSingleCorporationAssets(selectedCorporation);
  const { isLoading: isLoadingBlueprints, isError: isErrorBlueprints } =
    useGetAllCorporationBlueprints(selectedCorporation);

  const matchedCorporation = useUsersStore((state) =>
    state.account.corporations.find(
      (c) => Number(c.corporation_id) === Number(selectedCorporation)
    )
  );

  const isLoading = isLoadingAssets || isLoadingBlueprints;
  const isError = isErrorAssets || isErrorBlueprints;

  useEffect(() => {
    async function buildCorporationAssetsTree() {
      if (!matchedCorporation || isLoading || isError) {
        return;
      }

      const characterForCorp = characters.find(
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
        characterForCorp,
        assetIDSet,
        "corporation"
      );

      const additionalIDObjects = await getWorldData(
        requiredLocationID,
        characterForCorp
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
            key={locationID}
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
