import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedSingleCorporationAssets } from "../../../../Hooks/EveEsi/useGetSingleCorporationAssets";
import { useAssetHelperHooks } from "../../../../Hooks/AssetHooks/useAssetHelper";
import useUsersStore from "../../../../Zustand/usersStore";

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

        // Clear loading if assets finished but office/hangar not selected
        if (
            corporationAssetsLoading !== undefined &&
            !corporationAssetsLoading &&
            (!state.selectedCorporationOffice || !state.selectedCorporationHangar) &&
            state.isLoading
        ) {
            actions.setIsLoading(false);
            return;
        }

        // Process assets when loading completes and office/hangar are selected
        if (
            corporationAssetsLoading !== undefined &&
            !corporationAssetsLoading &&
            state.selectedCorporationOffice &&
            state.selectedCorporationHangar
        ) {
            // Check if we've already processed this office/hangar combination
            const locationChanged = 
                lastProcessedRef.current.selectedCorporation !== state.selectedCorporation ||
                lastProcessedRef.current.selectedCorporationOffice !== state.selectedCorporationOffice ||
                lastProcessedRef.current.selectedCorporationHangar !== state.selectedCorporationHangar;

            if (!locationChanged) {
                return;
            }

            async function processCorporationAssets() {
                const { data: corporationAssets } = getCachedSingleCorporationAssets(
                    queryClient,
                    state.selectedCorporation
                );

                // Only set corporation offices once per corporation/assets combination
                const officesKey = `${state.selectedCorporation}-${corporationAssets?.length || 0}`;
                if (!corporationOfficesSetRef.current.has(officesKey)) {
                    useUsersStore.getState().account.actions.setCorporationOffices(
                        state.selectedCorporation,
                        corporationAssets
                    );
                    corporationOfficesSetRef.current.add(officesKey);
                }

                if (!corporationAssets || corporationAssets.length === 0) {
                    actions.setIsLoading(false);
                    return;
                }

                // Get corporation object to understand office/hangar structure
                const corporationObject = useUsersStore
                    .getState()
                    .account.actions.getCorporation(state.selectedCorporation);

                if (!corporationObject) {
                    actions.setIsLoading(false);
                    return;
                }

                // Build asset maps to understand the structure
                const { assetsByLocationMap } = buildAssetMapsCorpOffices(
                    corporationAssets,
                    corporationObject
                );

                // Find the office object location (the item_id of the office container)
                const officeLocationAssets = assetsByLocationMap.get(state.selectedCorporationOffice) || [];
                const officeObjectLocation = officeLocationAssets[0]?.item_id;

                if (!officeObjectLocation) {
                    actions.setIsLoading(false);
                    return;
                }

                // Get all assets in the office container
                const officeAssets = assetsByLocationMap.get(officeObjectLocation) || [];

                // Filter assets by the selected hangar (location_flag must match hangar's assetLocationRef)
                const hangarAssets = officeAssets.filter(
                    (asset) => asset.location_flag === state.selectedCorporationHangar
                );

                if (hangarAssets.length === 0) {
                    actions.setIsLoading(false);
                    return;
                }

                // Clear existing assets before applying new ones
                state.shoppingList.clearAssetQuantities();

                // Convert filtered assets to map by type ID
                const assetsByTypeID = convertAssetArrayIntoMapByTypeID(hangarAssets);

                // Apply assets to shopping list
                actions.applyAssetsFromMap(assetsByTypeID, countAssetQuantityFromMap);
                actions.setIsLoading(false);

                // Update last processed location
                lastProcessedRef.current = {
                    selectedCorporation: state.selectedCorporation,
                    selectedCorporationOffice: state.selectedCorporationOffice,
                    selectedCorporationHangar: state.selectedCorporationHangar,
                };
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

