import { useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogActions,
  DialogContent,
  Button,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { getAllCachedCharacterAssets } from "../../../Hooks/EveEsi/Character/useGetAllCharacterAssets";
import { getFullItemList } from "../../../Functions/Helper/getCachedData";
import { useAssetHelperHooks } from "../../../Hooks/AssetHooks/useAssetHelper";
import useUsersStore from "../../../Zustand/usersStore";
import getAssetLocationNames from "../../../Functions/EveESI/World/getAssetLocationNames";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";
import AssignUsersSelect from "../../../Styled Components/Select/users";
import LoadingAssetDataAndError from "./loadingData";
import NoAssetsFound_AssetsDialog from "./noAssetsFound";
import DefaultLocationAssets from "./defaultLocationAssets";
import AssetLocations_AssetDialogWindow from "./assetLocations";
import CorporationSelect from "../../../Styled Components/Select/corporations";
import UseCorporationSelector_AssetsDialog from "./useCoporation";
import { getCachedSingleCorporationAssets } from "../../../Hooks/EveEsi/useGetSingleCorporationAssets";

export default function AssetsDialogContent(props) {
  const { state, actions, characterAssetsLoading, corporationAssetsLoading } =
    props;
  const { buildAssetTypeIDMaps, sortLocationMapsAlphabetically } =
    useAssetHelperHooks();
  const queryClient = useQueryClient();

  useEffect(() => {
    async function buildCharacterAssetsData() {
      if (characterAssetsLoading !== undefined && !characterAssetsLoading && state.selectedCharacter) {
        const fullItemList = await getFullItemList();
        const { data: allCharacterAssets } =
          getAllCachedCharacterAssets(queryClient);
        
        // Handle "allUsers" case by flattening all character assets
        const characterAssets = state.selectedCharacter === "allUsers"
          ? Object.values(allCharacterAssets).flat()
          : allCharacterAssets[state.selectedCharacter];
        
        const { assetsByLocationMap, topLevelAssetLocations, assetIDSet } =
          buildAssetTypeIDMaps(
            characterAssets,
            state.selectedTypeID
          );

        if (!topLevelAssetLocations) {
          console.error('topLevelAssetLocations is undefined');
          return;
        }

        const requiredLocationID = [...topLevelAssetLocations.keys()].reduce(
          (prev, locationID) => {
            const matchedID = useUsersStore
              .getState()
              .worldData.actions.findUniverseData(locationID);

            if (!matchedID) {
              prev.add(locationID);
            } else {
              if (matchedID.unResolvedLocation) {
                prev.add(locationID);
              }
            }
            return prev;
          },
          new Set()
        );

        // For "allUsers", use the main character for API calls
        const characterObject = state.selectedCharacter === "allUsers"
          ? useUsersStore.getState().account.actions.getMainCharacter()
          : useUsersStore.getState().account.actions.findCharacterByHash(state.selectedCharacter);

        if (!characterObject) {
          console.error('Character object not found for hash:', state.selectedCharacter);
          return;
        }

        const [locationNamesMap, additonalIDObjects] = await Promise.all([
          getAssetLocationNames(
            characterObject,
            assetIDSet,
            "character"
          ),
          getWorldData([...requiredLocationID], characterObject),
        ]);

        const topLevelAssetLocationsSORTED = sortLocationMapsAlphabetically(
          topLevelAssetLocations,
          additonalIDObjects
        );

        actions.setAssetLocations(assetsByLocationMap);
        actions.setTopLevelAssets(topLevelAssetLocationsSORTED);
        actions.setAssetLocationNames(locationNamesMap);
        actions.setFullItemList(fullItemList);
        useUsersStore
          .getState()
          .worldData.actions.addUniverseIDs(additonalIDObjects);
        actions.setIsLoading(false);
      }
    }
    buildCharacterAssetsData();
  }, [
    characterAssetsLoading,
    queryClient,
    state.selectedCharacter,
    state.selectedTypeID,
  ]);

  useEffect(() => {
    async function buildCorporationAssetsData() {
      if (corporationAssetsLoading !== undefined && !corporationAssetsLoading && state.selectedCorporation) {
        const fullItemList = await getFullItemList();
        const { data: corporationAssets } = getCachedSingleCorporationAssets(queryClient, state.selectedCorporation);

        const { assetsByLocationMap, topLevelAssetLocations, assetIDSet } =
          buildAssetTypeIDMaps(corporationAssets, state.selectedTypeID);

        if (!topLevelAssetLocations) {
          console.error('topLevelAssetLocations is undefined');
          return;
        }

        const requiredLocationID = [...topLevelAssetLocations.keys()].reduce(
          (prev, locationID) => {
            const matchedID = useUsersStore
              .getState()
              .worldData.actions.findUniverseData(locationID);

            if (!matchedID) {
              prev.add(locationID);
            } else {
              if (matchedID.unResolvedLocation) {
                prev.add(locationID);
              }
            }
            return prev;
          },
          new Set()
        );

        // Find a user from this corporation to use for API calls
        const userFromCorporation = Object.values(
          useUsersStore.getState().account.characters
        ).find((user) => user.corporation_id === state.selectedCorporation);

        if (!userFromCorporation) {
          console.error('No user found from corporation ID:', state.selectedCorporation);
          return;
        }

        const [locationNamesMap, additonalIDObjects] = await Promise.all([
          getAssetLocationNames(userFromCorporation, assetIDSet, "corporation"),
          getWorldData([...requiredLocationID], userFromCorporation),
        ]);

        const topLevelAssetLocationsSORTED = sortLocationMapsAlphabetically(
          topLevelAssetLocations,
          additonalIDObjects
        );
        actions.setAssetLocations(assetsByLocationMap);
        actions.setTopLevelAssets(topLevelAssetLocationsSORTED);
        actions.setAssetLocationNames(locationNamesMap);
        actions.setFullItemList(fullItemList);
        useUsersStore
          .getState()
          .account.actions.setCorporationOffices(state.selectedCorporation, corporationAssets);
        useUsersStore
          .getState()
          .worldData.actions.addUniverseIDs(additonalIDObjects);
        actions.setIsLoading(false);
      }
    }

    buildCorporationAssetsData();
  }, [
    corporationAssetsLoading,
    queryClient,
    state.selectedCorporation,
    state.selectedTypeID,
  ]);

  function handleClose() {
    actions.resetState();
  }

  return (
    <Dialog
      open={state.isOpen}
      onClose={handleClose}
      fullWidth
      maxWidth="lg"
      sx={{
        "& .MuiDialog-paper": {
          height: "100vh",
          width: "90vw",
        },
      }}
    >
      <DialogTitle>Material Assets</DialogTitle>
      <DialogActions>
        {state.useCorporationAssets ?
          <CorporationSelect
            value={state.selectedCorporation}
            onChange={actions.setSelectedCorporation}
            formHelperText={""}
          />
          : (
            <AssignUsersSelect
              value={state.selectedCharacter}
              onChange={actions.setSelectedCharacter}
              formHelperText={""}
            />
          )}
      </DialogActions>
      <DialogContent>
        <LoadingAssetDataAndError {...props} />
        <NoAssetsFound_AssetsDialog {...props} />
        <DefaultLocationAssets {...props} />
        <AssetLocations_AssetDialogWindow {...props} />
      </DialogContent>
      <DialogActions>
        <UseCorporationSelector_AssetsDialog {...props} />
        <Button
          variant="contained"
          size="small"
          color="primary"
          onClick={handleClose}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

