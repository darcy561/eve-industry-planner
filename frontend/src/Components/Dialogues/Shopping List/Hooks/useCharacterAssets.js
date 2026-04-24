import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAllCachedCharacterAssets } from "../../../../Hooks/EveEsi/Character/useGetAllCharacterAssets";
import {
  findAssetsInLocation,
  convertAssetArrayIntoMapByTypeID,
  countAssetQuantityFromMap,
} from "../../../../Functions/Assets/assetHelpers";
import { getAssetLocationList } from "../../../../Functions/Assets/getAssetLocations";
import useUsersStore from "../../../../Zustand/usersStore";

/**
 * Hook for processing character assets in the shopping list.
 * Only processes when assetType is "character" and assets are loaded.
 * Updates assets when location changes.
 * 
 * @param {Object} params - Hook parameters
 * @param {Object} params.state - Shopping list state
 * @param {Object} params.actions - Shopping list actions
 * @param {boolean|undefined} params.allCharacterAssetsLoading - Character assets loading state
 */
export function useShoppingListCharacterAssets({
    state,
    actions,
    allCharacterAssetsLoading,
}) {
    const queryClient = useQueryClient();

    // Track last processed location to avoid reprocessing
    const lastProcessedRef = useRef({
        selectedCharacter: null,
        selectedAssetLocation: null,
    });

    useEffect(() => {
        // Only process character assets
        if (state.assetType !== "character") {
            return;
        }

        // Early return if shopping list isn't ready
        if (!state.shoppingList || state.buildingShoppingList) {
            return;
        }

        // Set loading when assets start loading
        if (
            allCharacterAssetsLoading !== undefined &&
            allCharacterAssetsLoading &&
            !state.isLoading
        ) {
            actions.setIsLoading(true, "Loading character assets from ESI…");
            return;
        }

        // Process assets when loading completes and location is selected
        if (
            allCharacterAssetsLoading !== undefined &&
            !allCharacterAssetsLoading &&
            state.selectedAssetLocation
        ) {
            // Check if we've already processed this location
            const locationChanged = 
                lastProcessedRef.current.selectedCharacter !== state.selectedCharacter ||
                lastProcessedRef.current.selectedAssetLocation !== state.selectedAssetLocation;

            if (!locationChanged) {
                return;
            }

            async function processCharacterAssets() {
                const { data: allCharacterAssets } =
                    getAllCachedCharacterAssets(queryClient);

                if (!allCharacterAssets) {
                    actions.setIsLoading(false);
                    return;
                }

                const allAssets =
                    state.selectedCharacter === "allUsers"
                        ? Object.values(allCharacterAssets).flat()
                        : allCharacterAssets[state.selectedCharacter];

                // Get locations from all available assets (only once)
                if (!state.assetLocations || state.assetLocations.length === 0) {
                    const allAvailableAssets = Object.values(allCharacterAssets).flat();
                    const { itemLocations, newEveIDs } = await getAssetLocationList(
                        allAvailableAssets
                    );
                    actions.setAssetLocations(itemLocations || []);
                    useUsersStore.getState().worldData.actions.addUniverseIDs(newEveIDs);
                }

                if (!allAssets || allAssets.length === 0) {
                    actions.setIsLoading(false);
                    return;
                }

                // Find assets in the selected location
                const locationAssets = findAssetsInLocation(
                    allAssets,
                    state.selectedAssetLocation
                );

                // Clear existing assets before applying new ones
                state.shoppingList.clearAssetQuantities();

                // Convert assets to map by type ID
                const assetsByTypeID = convertAssetArrayIntoMapByTypeID(locationAssets);

                // Apply assets to shopping list
                actions.applyAssetsFromMap(assetsByTypeID, countAssetQuantityFromMap);
                actions.setIsLoading(false);

                // Update last processed location
                lastProcessedRef.current = {
                    selectedCharacter: state.selectedCharacter,
                    selectedAssetLocation: state.selectedAssetLocation,
                };
            }

            processCharacterAssets();
        }
    }, [
        state.assetType,
        state.shoppingList,
        state.buildingShoppingList,
        state.selectedCharacter,
        state.selectedAssetLocation,
        state.assetLocations,
        allCharacterAssetsLoading,
        state.isLoading,
        queryClient,
        findAssetsInLocation,
        convertAssetArrayIntoMapByTypeID,
        countAssetQuantityFromMap,
        actions.setIsLoading,
        actions.setAssetLocations,
        actions.applyAssetsFromMap,
    ]);
}

