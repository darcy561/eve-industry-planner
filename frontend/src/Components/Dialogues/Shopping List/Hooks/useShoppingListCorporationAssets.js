import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedSingleCorporationAssets } from "../../../../Hooks/EveEsi/useGetSingleCorporationAssets";
import { useAssetHelperHooks } from "../../../../Hooks/AssetHooks/useAssetHelper";
import useUsersStore from "../../../../Zustand/usersStore";
import getWorldData from "../../../../Functions/EveESI/World/getWorldData";

/**
 * Hook for processing corporation assets in the shopping list.
 * Only processes when assetType is "corporation", assets are loaded, and office/hangar are selected.
 *
 * @param {Object} params - Hook parameters
 * @param {Object} params.state - Shopping list state
 * @param {Object} params.actions - Shopping list actions
 * @param {boolean|undefined} params.corporationAssetsLoading - Corporation assets loading state
 */
export function useShoppingListCorporationAssets({
  state,
  actions,
  corporationAssetsLoading,
}) {
  const queryClient = useQueryClient();
  const {
    convertAssetArrayIntoMapByTypeID,
    countAssetQuantityFromMap,
    buildAssetMapsCorpOffices,
  } = useAssetHelperHooks();

  // Track if we've already set corporation offices to prevent infinite loops
  const corporationOfficesSetRef = useRef(new Set());

  // Track last processed office/hangar to avoid reprocessing
  const lastProcessedRef = useRef({
    selectedCorporation: null,
    selectedCorporationOffice: null,
    selectedCorporationHangar: null,
  });

  // Separate effect to set corporation offices when assets finish loading
  // This runs independently of the asset processing logic
  useEffect(() => {
    if (state.assetType !== "corporation" || !state.selectedCorporation) {
      return;
    }

    if (corporationAssetsLoading !== undefined && !corporationAssetsLoading) {
      const { data: corporationAssets } = getCachedSingleCorporationAssets(
        queryClient,
        state.selectedCorporation
      );

      if (corporationAssets && corporationAssets.length > 0) {
        // Check if corporation object exists
        const corporationObject = useUsersStore
          .getState()
          .users.actions.getCorporationObject(state.selectedCorporation);

        if (corporationObject) {
          // Always update offices when assets are loaded
          // addOfficeLocations handles duplicates, so it's safe to call multiple times
          // Use a key to prevent excessive calls during the same render cycle
          const officesKey = `${state.selectedCorporation}-${corporationAssets.length}`;

          if (!corporationOfficesSetRef.current.has(officesKey)) {
            useUsersStore
              .getState()
              .users.actions.setCorporationOffices(
                state.selectedCorporation,
                corporationAssets
              );
            corporationOfficesSetRef.current.add(officesKey);

            // Fetch location names for all office locations
            // getWorldData will filter out IDs that already exist
            async function fetchOfficeLocationNames() {
              const updatedCorporationObject = useUsersStore
                .getState()
                .users.actions.getCorporationObject(state.selectedCorporation);

              if (
                updatedCorporationObject &&
                updatedCorporationObject.officeLocations
              ) {
                // Get a user object for the corporation
                const users = useUsersStore.getState().users.userArray;
                const userObject = users.find(
                  (user) => user.corporation_id === state.selectedCorporation
                );

                if (
                  userObject &&
                  updatedCorporationObject.officeLocations.length > 0
                ) {
                  const locationNames = await getWorldData(
                    updatedCorporationObject.officeLocations,
                    userObject
                  );
                  if (Object.keys(locationNames).length > 0) {
                    useUsersStore
                      .getState()
                      .worldData.actions.addUniverseIDs(locationNames);
                  }
                }
              }
            }

            fetchOfficeLocationNames();
          }
        }
      }
    }
  }, [
    state.assetType,
    state.selectedCorporation,
    corporationAssetsLoading,
    queryClient,
  ]);

  useEffect(() => {
    // Only process corporation assets
    if (state.assetType !== "corporation") {
      return;
    }

    // Early return if shopping list isn't ready
    if (!state.shoppingList || state.buildingShoppingList) {
      return;
    }

    // Early return if corporation not selected
    if (!state.selectedCorporation) {
      return;
    }

    // Set loading when assets start loading
    if (
      corporationAssetsLoading !== undefined &&
      corporationAssetsLoading &&
      !state.isLoading
    ) {
      actions.setIsLoading(true);
      return;
    }

    // Clear assets when corporation changes
    const corporationChanged =
      lastProcessedRef.current.selectedCorporation !==
        state.selectedCorporation && state.selectedCorporation !== null;

    if (corporationChanged && state.shoppingList) {
      state.shoppingList.clearAssetQuantities();
      state.shoppingList.calculateVisibleItems(state);
      state.shoppingList.calculateTotalVolume();
      state.shoppingList.calculateTotalValue();
      // Update ref to track corporation change
      lastProcessedRef.current.selectedCorporation = state.selectedCorporation;
      // Reset office and hangar in ref since they get reset when corporation changes
      lastProcessedRef.current.selectedCorporationOffice = null;
      lastProcessedRef.current.selectedCorporationHangar = null;
    }

    // Clear assets when office changes (even if hangar not selected yet)
    const officeChanged =
      lastProcessedRef.current.selectedCorporationOffice !==
        state.selectedCorporationOffice &&
      state.selectedCorporationOffice !== null;

    if (officeChanged && state.shoppingList) {
      state.shoppingList.clearAssetQuantities();
      state.shoppingList.calculateVisibleItems(state);
      state.shoppingList.calculateTotalVolume();
      state.shoppingList.calculateTotalValue();
      // Update ref to track office change
      lastProcessedRef.current.selectedCorporationOffice =
        state.selectedCorporationOffice;
      // Reset hangar in ref since it gets reset when office changes
      lastProcessedRef.current.selectedCorporationHangar = null;
    }

    // Clear loading if assets finished but office/hangar not selected
    // BUT don't return early - we want to continue to check if we can process
    if (
      corporationAssetsLoading !== undefined &&
      !corporationAssetsLoading &&
      (!state.selectedCorporationOffice || !state.selectedCorporationHangar) &&
      state.isLoading
    ) {
      actions.setIsLoading(false);
      // Don't return here - continue to check processing conditions
    }

    // Process assets when loading completes and office/hangar are selected
    // This matches the character assets pattern - single condition check
    if (
      corporationAssetsLoading !== undefined &&
      !corporationAssetsLoading &&
      state.selectedCorporationOffice &&
      state.selectedCorporationHangar
    ) {
      // Check if we've already processed this office/hangar combination
      const locationChanged =
        lastProcessedRef.current.selectedCorporation !==
          state.selectedCorporation ||
        lastProcessedRef.current.selectedCorporationOffice !==
          state.selectedCorporationOffice ||
        lastProcessedRef.current.selectedCorporationHangar !==
          state.selectedCorporationHangar;

      if (!locationChanged) {
        // Clear loading if we've already processed this location
        if (state.isLoading) {
          actions.setIsLoading(false);
        }
        return;
      }

      // Update last processed location IMMEDIATELY to prevent effect from running again
      // while async processing is happening
      lastProcessedRef.current = {
        selectedCorporation: state.selectedCorporation,
        selectedCorporationOffice: state.selectedCorporationOffice,
        selectedCorporationHangar: state.selectedCorporationHangar,
      };

      async function processCorporationAssets() {
        const { data: corporationAssets } = getCachedSingleCorporationAssets(
          queryClient,
          state.selectedCorporation
        );

        // Clear assets before processing
        if (state.shoppingList) {
          state.shoppingList.clearAssetQuantities();
        }

        if (!corporationAssets || corporationAssets.length === 0) {
          // Apply empty map to reset applied assets info
          actions.applyAssetsFromMap(new Map(), countAssetQuantityFromMap);
          actions.setIsLoading(false);
          return;
        }

        // Get corporation object to understand office/hangar structure
        const corporationObject = useUsersStore
          .getState()
          .users.actions.getCorporationObject(state.selectedCorporation);

        if (!corporationObject) {
          // Apply empty map to reset applied assets info
          actions.applyAssetsFromMap(new Map(), countAssetQuantityFromMap);
          actions.setIsLoading(false);
          return;
        }

        // Build asset maps to understand the structure
        const { assetsByLocationMap } = buildAssetMapsCorpOffices(
          corporationAssets,
          corporationObject
        );

        // Find the office object location (the item_id of the office container)
        const officeLocationAssets =
          assetsByLocationMap.get(state.selectedCorporationOffice) || [];
        const officeObjectLocation = officeLocationAssets[0]?.item_id;

        if (!officeObjectLocation) {
          // Apply empty map to reset applied assets info
          actions.applyAssetsFromMap(new Map(), countAssetQuantityFromMap);
          actions.setIsLoading(false);
          return;
        }

        // Get all assets in the office container
        let officeAssets =
          assetsByLocationMap.get(officeObjectLocation) || [];

        // If no assets found at officeObjectLocation, try looking at the office location directly
        if (officeAssets.length === 0) {
          officeAssets = assetsByLocationMap.get(state.selectedCorporationOffice) || [];
        }

        // Find the OfficeFolder asset - hangar assets are nested inside it
        const officeFolderAsset = officeAssets.find(
          (asset) => asset.location_flag === "OfficeFolder"
        );

        // Get all assets inside the OfficeFolder (where location_id matches OfficeFolder's item_id)
        let hangarContainerAssets = [];
        if (officeFolderAsset) {
          hangarContainerAssets = corporationAssets.filter(
            (asset) => asset.location_id === officeFolderAsset.item_id
          );
        } else {
          // If no OfficeFolder, try looking directly in office assets
          hangarContainerAssets = officeAssets;
        }

        // Filter assets by the selected hangar (location_flag must match hangar's assetLocationRef)
        const directHangarAssets = hangarContainerAssets.filter(
          (asset) => asset.location_flag === state.selectedCorporationHangar
        );

        // Recursively collect all child assets from hangar assets
        const getAllChildAssets = (parentAsset, allAssets) => {
          const children = allAssets.filter(
            (asset) => asset.location_id === parentAsset.item_id
          );
          const result = [parentAsset];
          for (const child of children) {
            result.push(...getAllChildAssets(child, allAssets));
          }
          return result;
        };

        // Collect all hangar assets including nested children
        const hangarAssets = [];
        const processedItemIds = new Set();
        for (const asset of directHangarAssets) {
          if (!processedItemIds.has(asset.item_id)) {
            const allRelatedAssets = getAllChildAssets(
              asset,
              corporationAssets
            );
            for (const relatedAsset of allRelatedAssets) {
              if (!processedItemIds.has(relatedAsset.item_id)) {
                hangarAssets.push(relatedAsset);
                processedItemIds.add(relatedAsset.item_id);
              }
            }
          }
        }

        // Assets already cleared above when location changed

        // Convert filtered assets to map by type ID (empty if no assets)
        const assetsByTypeID = hangarAssets.length > 0
          ? convertAssetArrayIntoMapByTypeID(hangarAssets)
          : new Map();

        // Apply assets to shopping list (always call to reset applied assets info)
        actions.applyAssetsFromMap(assetsByTypeID, countAssetQuantityFromMap);
        actions.setIsLoading(false);
      }

      processCorporationAssets();
    }
  }, [
    state.assetType,
    state.shoppingList,
    state.buildingShoppingList,
    state.selectedCorporation,
    state.selectedCorporationOffice,
    state.selectedCorporationHangar,
    corporationAssetsLoading,
    state.isLoading,
    queryClient,
    convertAssetArrayIntoMapByTypeID,
    countAssetQuantityFromMap,
    buildAssetMapsCorpOffices,
    actions.setIsLoading,
    actions.applyAssetsFromMap,
  ]);

  // Clear corporation offices tracking when corporation assets are disabled or corporation changes
  useEffect(() => {
    if (state.assetType !== "corporation" || !state.selectedCorporation) {
      corporationOfficesSetRef.current.clear();
    }
  }, [state.assetType, state.selectedCorporation]);
}
