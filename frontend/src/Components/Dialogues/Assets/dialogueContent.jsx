import { useEffect } from "react";
import { Box, Button } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { getAllCachedCharacterAssets } from "../../../Hooks/EveEsi/Character/useGetAllCharacterAssets";
import { getFullItemList } from "../../../Functions/Helper/getCachedData";
import {
  buildAssetTypeIDMaps,
  sortLocationMapsAlphabetically,
} from "../../../Functions/Assets/assetHelpers";
import useUsersStore from "../../../Zustand/usersStore";
import getAssetLocationNames from "../../../Functions/EveESI/World/getAssetLocationNames";
import getWorldData from "../../../Functions/EveESI/World/getWorldData";
import AssignUsersSelect from "../../../Styled Components/Select/users";
import NoAssetsFound_AssetsDialogue from "./noAssetsFound";
import DefaultLocationAssets from "./defaultLocationAssets";
import AssetLocations_AssetDialogueWindow from "./assetLocations";
import CorporationSelect from "../../../Styled Components/Select/corporations";
import UseCorporationSelector_AssetsDialogue from "./useCorporation";
import { getCachedSingleCorporationAssets } from "../../../Hooks/EveEsi/useGetSingleCorporationAssets";
import ContentDialogue from "../../../Styled Components/Dialogue/ContentDialogue";
import { isNoAccessLocation } from "../../../Functions/Assets/assetLocationConstants";

export default function AssetsDialogueContent(props) {
  const {
    state,
    actions,
    characterAssetsLoading,
    corporationAssetsLoading,
    characterAssetsError,
    corporationAssetsError,
  } = props;
  const queryClient = useQueryClient();

  useEffect(() => {
    async function buildCharacterAssetsData() {
      if (
        characterAssetsLoading !== undefined &&
        !characterAssetsLoading &&
        state.selectedCharacter
      ) {
        actions.setIsLoading(true, "Resolving locations and names…");
        const fullItemList = await getFullItemList();
        const { data: allCharacterAssets } =
          getAllCachedCharacterAssets(queryClient);

        // Handle "allUsers" case by flattening all character assets
        const characterAssets =
          state.selectedCharacter === "allUsers"
            ? Object.values(allCharacterAssets).flat()
            : allCharacterAssets[state.selectedCharacter];

        const { assetsByLocationMap, topLevelAssetLocations, assetIDSet } =
          buildAssetTypeIDMaps(characterAssets, state.selectedTypeID);

        if (!topLevelAssetLocations) {
          console.error("topLevelAssetLocations is undefined");
          actions.setIsLoading(false);
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
              if (isNoAccessLocation(matchedID)) {
                prev.add(locationID);
              }
            }
            return prev;
          },
          new Set(),
        );

        // For "allUsers", use the main character for API calls
        const characterObject =
          state.selectedCharacter === "allUsers"
            ? useUsersStore.getState().account.actions.getMainCharacter()
            : useUsersStore
                .getState()
                .account.actions.findCharacterByHash(state.selectedCharacter);

        if (!characterObject) {
          console.error(
            "Character object not found for hash:",
            state.selectedCharacter,
          );
          actions.setIsLoading(false);
          return;
        }

        const [locationNamesMap, additonalIDObjects] = await Promise.all([
          getAssetLocationNames(characterObject, assetIDSet, "character"),
          getWorldData([...requiredLocationID], characterObject),
        ]);

        const topLevelAssetLocationsSORTED = sortLocationMapsAlphabetically(
          topLevelAssetLocations,
          additonalIDObjects,
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
      if (
        corporationAssetsLoading !== undefined &&
        !corporationAssetsLoading &&
        state.selectedCorporation
      ) {
        actions.setIsLoading(true, "Resolving locations and names…");
        const fullItemList = await getFullItemList();
        const { data: corporationAssets } = getCachedSingleCorporationAssets(
          queryClient,
          state.selectedCorporation,
        );

        const { assetsByLocationMap, topLevelAssetLocations, assetIDSet } =
          buildAssetTypeIDMaps(corporationAssets, state.selectedTypeID);

        if (!topLevelAssetLocations) {
          console.error("topLevelAssetLocations is undefined");
          actions.setIsLoading(false);
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
              if (isNoAccessLocation(matchedID)) {
                prev.add(locationID);
              }
            }
            return prev;
          },
          new Set(),
        );

        // Find a user from this corporation to use for API calls
        const userFromCorporation = Object.values(
          useUsersStore.getState().account.characters,
        ).find((user) => user.corporation_id === state.selectedCorporation);

        if (!userFromCorporation) {
          console.error(
            "No user found from corporation ID:",
            state.selectedCorporation,
          );
          actions.setIsLoading(false);
          return;
        }

        const [locationNamesMap, additonalIDObjects] = await Promise.all([
          getAssetLocationNames(userFromCorporation, assetIDSet, "corporation"),
          getWorldData([...requiredLocationID], userFromCorporation),
        ]);

        const topLevelAssetLocationsSORTED = sortLocationMapsAlphabetically(
          topLevelAssetLocations,
          additonalIDObjects,
        );
        actions.setAssetLocations(assetsByLocationMap);
        actions.setTopLevelAssets(topLevelAssetLocationsSORTED);
        actions.setAssetLocationNames(locationNamesMap);
        actions.setFullItemList(fullItemList);
        useUsersStore
          .getState()
          .account.actions.setCorporationOffices(
            state.selectedCorporation,
            corporationAssets,
          );
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

  const assetsQueryLoading = state.useCorporationAssets
    ? Boolean(corporationAssetsLoading)
    : Boolean(characterAssetsLoading);

  const assetsQueryError = state.useCorporationAssets
    ? corporationAssetsError
    : characterAssetsError;

  const isError = Boolean(assetsQueryError);
  const contentError = isError
    ? assetsQueryError instanceof Error
      ? assetsQueryError
      : new Error(
          assetsQueryError?.message ||
            String(assetsQueryError || "Error loading assets"),
        )
    : null;

  const isLoading = !isError && (assetsQueryLoading || state.isLoading);

  const topSelector = state.useCorporationAssets ? (
    <CorporationSelect
      value={state.selectedCorporation}
      onChange={actions.setSelectedCorporation}
      formHelperText={""}
    />
  ) : (
    <AssignUsersSelect
      value={state.selectedCharacter}
      onChange={actions.setSelectedCharacter}
      formHelperText={""}
    />
  );

  return (
    <ContentDialogue
      open={state.isOpen}
      onClose={handleClose}
      title="Material Assets"
      dialogueTitleProps={{ id: "AssetsDialogue" }}
      componentName="AssetsDialogue"
      maxWidth="lg"
      fullWidth
      asyncState={{
        isLoading,
        isError,
        error: contentError,
        loadingMessage: state.loadingMessage ?? "Loading assets and locations…",
      }}
      helperArea={
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            width: "100%",
          }}
        >
          {topSelector}
        </Box>
      }
      actions={
        <>
          <UseCorporationSelector_AssetsDialogue {...props} />
          <Button
            variant="contained"
            size="small"
            color="primary"
            onClick={handleClose}
          >
            Close
          </Button>
        </>
      }
      dialogueSx={{
        "& .MuiDialog-paper": {
          height: "100vh",
          width: "90vw",
        },
      }}
      dialogueContentSx={{
        padding: "20px",
        overflow: "auto",
        flex: "1 1 auto",
        minHeight: 0,
      }}
    >
      <NoAssetsFound_AssetsDialogue {...props} />
      <DefaultLocationAssets {...props} />
      <AssetLocations_AssetDialogueWindow {...props} />
    </ContentDialogue>
  );
}
