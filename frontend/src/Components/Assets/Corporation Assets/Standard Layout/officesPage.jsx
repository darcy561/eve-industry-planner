import { useEffect, useState } from "react";
import {
  buildAssetMapsCorpOffices,
  sortLocationMapsAlphabetically,
} from "../../../../Functions/Assets/assetHelpers";
import { AssetEntry_TopLevel_CorporationOffices } from "./AssetFolders/topLevelFolderOffices";
import { AssetsPage_Loading } from "../../Character Assets/Standard Layout/loadingPage";
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

export function OfficesPage_Corporation({ selectedCorporation }) {
  const characters = useUsersStore((state) => state.account.characters);
  const getCorporation = useUsersStore(
    (state) => state.account.actions.getCorporation
  );
  const setCorporationOffices =
    useUsersStore.getState().account.actions.setCorporationOffices;
  const [topLevelAssets, updateTopLevelAssets] = useState(null);
  const [assetLocations, updateAssetLocations] = useState(null);
  const [assetLocationNames, updateAssetLocationNames] = useState(null);
  const [characterBlueprintsMap, updateCharacterBlueprintsMap] = useState(null);
  const [fullItemList, setFullItemList] = useState(null);
  const queryClient = useQueryClient();
  const matchedCorporation = getCorporation(selectedCorporation);

  const { isLoading: isLoadingAssets, isError: isErrorAssets } =
    useGetSingleCorporationAssets(selectedCorporation);

  const { isLoading: isLoadingBlueprints, isError: isErrorBlueprints } =
    useGetAllCorporationBlueprints(selectedCorporation);

  const isLoading = isLoadingAssets || isLoadingBlueprints;
  const isError = isErrorAssets || isErrorBlueprints;

  useEffect(() => {
    async function buildCorporationAssestsTree() {
      if (!matchedCorporation || isLoading || isError) {
        return;
      }

      const characterForCorp = characters.find(
        (i) => i.corporation_id === selectedCorporation
      );

      const corporationBlueprintsMap = new Map();

      const { data: corporationBlueprints } =
        getAllCachedCorporationBlueprints(queryClient);

      const { data: corporationAssets } = getCachedSingleCorporationAssets(
        queryClient,
        selectedCorporation
      );

      setCorporationOffices(selectedCorporation, corporationAssets);

      Object.values(corporationBlueprints[selectedCorporation]).forEach(
        (blueprint) => {
          corporationBlueprintsMap.set(blueprint.item_id, blueprint);
        }
      );

      const fullItemListData = await getFullItemList();

      const filteredAssets = corporationAssets.filter(
        (i) => i.location_flag !== "AssetSafety" && i.location_flag !== "CorpDeliveries"
      );

      const { topLevelAssetLocations, assetsByLocationMap, assetIDSet } =
        buildAssetMapsCorpOffices(filteredAssets, matchedCorporation);

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

      const [locationNamesMap, additionalIDObjects] = await Promise.all([
        getAssetLocationNames(characterForCorp, assetIDSet, "corporation"),
        getWorldData([...requiredLocationID], characterForCorp),
      ]);

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
      updateCharacterBlueprintsMap(corporationBlueprintsMap);
    }
    buildCorporationAssestsTree();
  }, [selectedCorporation, isLoading, isError]);

  if (
    !assetLocations ||
    !topLevelAssets ||
    !assetLocationNames ||
    !characterBlueprintsMap ||
    !fullItemList ||
    isLoading ||
    isError
  )
    return <AssetsPage_Loading />;

  return (
    <>
      {Array.from(topLevelAssets).map(([locationID, assets], index) => {
        let depth = 1;
        return (
          <AssetEntry_TopLevel_CorporationOffices
            key={uuid()}
            locationID={locationID}
            assets={assets}
            assetLocations={assetLocations}
            topLevelAssets={topLevelAssets}
            assetLocationNames={assetLocationNames}
            characterBlueprintsMap={characterBlueprintsMap}
            matchedCorporation={matchedCorporation}
            depth={depth}
            index={index}
            fullItemList={fullItemList}
          />
        );
      })}
    </>
  );
}
