import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAllCachedCharacterAssets } from "../../../../Hooks/EveEsi/Character/useGetAllCharacterAssets";
import { countAssetQuantityFromMap } from "../../../../Functions/Assets/assetQuantities";
import assetsAtLocation from "../../../../Functions/Assets/assetsAtLocation";
import {
  ASSET_SCOPE,
  getCachedAssetIndex,
} from "../../../../Hooks/EveEsi/useAssetIndex";
import useAssetLocations from "../../../../Hooks/EveEsi/useAssetLocations";

/**
 * Hook for processing character assets in the shopping list.
 * Only processes when assetType is "character" and assets are loaded.
 * Updates assets when location changes.
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.state - Shopping list state
 * @param {Object} params.actions - Shopping list actions
 * @param {boolean|undefined} params.allCharacterAssetsLoading - Character assets loading state
 * @returns {{assetLocationsLoading: boolean, assetLocationsError: boolean}} the state of the
 *   locations there are to choose from
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

  const {
    locations,
    isLoading: assetLocationsLoading,
    isError: assetLocationsError,
  } = useAssetLocations({ enabled: state.assetType === "character" });

  // The dropdown offers the same locations the settings and first-login pickers do, already
  // named, readable and in display order.
  useEffect(() => {
    if (state.assetType !== "character") return;

    actions.setAssetLocations(locations.map(({ locationId }) => locationId));
  }, [state.assetType, locations, actions.setAssetLocations]);

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

    // Clear assets when character changes
    const characterChanged =
      lastProcessedRef.current.selectedCharacter !== state.selectedCharacter &&
      state.selectedCharacter !== null;

    if (characterChanged && state.shoppingList) {
      state.shoppingList.clearAssetQuantities();
      // Update ref to track character change (but don't update location yet - let processing handle it)
      lastProcessedRef.current.selectedCharacter = state.selectedCharacter;
      // Reset location in ref since it gets reset when character changes
      lastProcessedRef.current.selectedAssetLocation = null;
    }

    // Clear assets when location changes (but don't update ref - let processing handle it)
    const locationChanged =
      lastProcessedRef.current.selectedAssetLocation !==
        state.selectedAssetLocation && state.selectedAssetLocation !== null;

    if (locationChanged && state.shoppingList) {
      state.shoppingList.clearAssetQuantities();
      // Don't recalculate here - the reducer will handle it when assets are applied
      // This ensures React re-renders properly
    }

    // Clear loading if assets finished but location not selected
    // BUT don't return early - we want to continue to check if we can process
    if (
      allCharacterAssetsLoading !== undefined &&
      !allCharacterAssetsLoading &&
      !state.selectedAssetLocation &&
      state.isLoading
    ) {
      actions.setIsLoading(false);
      // Don't return here - continue to check processing conditions
    }

    if (
      allCharacterAssetsLoading !== undefined &&
      !allCharacterAssetsLoading &&
      state.selectedAssetLocation
    ) {
      // Check if we've already processed this location
      const needsProcessing =
        lastProcessedRef.current.selectedCharacter !==
          state.selectedCharacter ||
        lastProcessedRef.current.selectedAssetLocation !==
          state.selectedAssetLocation;

      if (!needsProcessing) {
        // Clear loading if we've already processed this location
        if (state.isLoading) {
          actions.setIsLoading(false);
        }
        return;
      }

      // Update last processed location IMMEDIATELY to prevent effect from running again
      // while async processing is happening
      lastProcessedRef.current = {
        selectedCharacter: state.selectedCharacter,
        selectedAssetLocation: state.selectedAssetLocation,
      };

      async function processCharacterAssets() {
        actions.setIsLoading(true, "Applying character assets to list…");
        // Clear existing assets before applying new ones
        if (state.shoppingList) {
          state.shoppingList.clearAssetQuantities();
        }

        const { data: allCharacterAssets } =
          getAllCachedCharacterAssets(queryClient);

        // A node's location is resolved when the collection is built, so a container's
        // contents are counted with whatever holds them.
        const collection = getCachedAssetIndex(queryClient, {
          scope:
            state.selectedCharacter === "allUsers"
              ? ASSET_SCOPE.CHARACTERS
              : ASSET_SCOPE.CHARACTER,
          id:
            state.selectedCharacter === "allUsers"
              ? undefined
              : state.selectedCharacter,
        });
        const allAssets =
          state.selectedCharacter === "allUsers"
            ? Object.values(allCharacterAssets).flat()
            : allCharacterAssets[state.selectedCharacter];

        if (!allAssets || allAssets.length === 0) {
          // Apply empty map to reset applied assets info
          actions.applyAssetsFromMap(new Map(), countAssetQuantityFromMap);
          actions.setIsLoading(false);
          return;
        }

        // Find assets in the selected location

        // Convert assets to map by type ID (empty if no assets)
        const assetsByTypeID = assetsAtLocation(
          collection,
          state.selectedAssetLocation,
        );

        // Apply assets to shopping list (always call to reset applied assets info)
        // The reducer will handle calculateVisibleItems, calculateTotalVolume, and calculateTotalValue
        actions.applyAssetsFromMap(assetsByTypeID, countAssetQuantityFromMap);

        actions.setIsLoading(false);
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
    countAssetQuantityFromMap,
    actions.setIsLoading,
    actions.setAssetLocations,
    actions.applyAssetsFromMap,
  ]);

  return { assetLocationsLoading, assetLocationsError };
}
