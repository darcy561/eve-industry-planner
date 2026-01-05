/**
 * Shopping List Reducer Hook for EVE Industry Planner.
 * 
 * Custom React hook that provides state management for the shopping list dialog component.
 * Uses useReducer with a custom reducer to handle complex state transitions for
 * shopping list building, asset management, character/corporation selection,
 * and clipboard operations.
 * 
 * @fileoverview Custom hook for shopping list dialog state management
 * @author EVE Industry Planner Team
 */

import { useReducer, useMemo } from "react";
import { SHOPPING_LIST_ACTION_TYPES, shoppingListReducer } from "./shoppingListReducer";
import useUsersStore from "../../../../Zustand/usersStore";

/**
 * Custom hook for managing shopping list dialog state.
 * 
 * Provides a reducer-based state management solution for the shopping list dialog,
 * including initial state creation based on current user data, action dispatching,
 * and state access. The hook automatically determines initial values based on
 * the current user's data and application settings.
 * 
 * @returns {Object} Hook return object
 * @returns {Object} returns.state - Current dialog state
 * @returns {boolean} returns.state.isOpen - Whether dialog is open
 * @returns {boolean} returns.state.isLoading - Loading state
 * @returns {boolean} returns.state.buildingShoppingList - Whether building shopping list
 * @returns {Array} returns.state.requestedJobIDs - Array of requested job IDs
 * @returns {Object|null} returns.state.shoppingList - Shopping list object
 * @returns {boolean} returns.state.displayChildJobMaterials - Whether to display child job materials
 * @returns {boolean} returns.state.useAssets - Whether to use assets
 * @returns {boolean} returns.state.assetsImportedFromClipboard - Whether assets imported from clipboard
 * @returns {boolean} returns.state.useCorporationAssets - Whether to use corporation assets
 * @returns {Array} returns.state.assetLocations - Asset locations data
 * @returns {string|null} returns.state.selectedCharacter - Selected character hash
 * @returns {number|null} returns.state.selectedAssetLocation - Selected asset location ID
 * @returns {number|null} returns.state.selectedCorporation - Selected corporation ID
 * @returns {Object} returns.actions - Action dispatchers
 * @returns {Function} returns.actions.toggleIsOpen - Toggle dialog open/closed
 * @returns {Function} returns.actions.toggleIsLoading - Toggle loading state
 * @returns {Function} returns.actions.setIsLoading - Set loading state
 * @returns {Function} returns.actions.toggleBuildingShoppingList - Toggle building mode
 * @returns {Function} returns.actions.setRequestedJobIDs - Set requested job IDs
 * @returns {Function} returns.actions.toggleDisplayChildJobMaterials - Toggle child materials display
 * @returns {Function} returns.actions.toggleUseAssets - Toggle asset usage
 * @returns {Function} returns.actions.toggleAssetsImportedFromClipboard - Toggle clipboard import status
 * @returns {Function} returns.actions.toggleUseCorporationAssets - Toggle corporation assets
 * @returns {Function} returns.actions.setAssetLocations - Set asset locations
 * @returns {Function} returns.actions.setSelectedCharacter - Set selected character
 * @returns {Function} returns.actions.setSelectedAssetLocation - Set selected asset location
 * @returns {Function} returns.actions.setSelectedCorporation - Set selected corporation
 * @returns {Function} returns.actions.setShoppingList - Set shopping list object
 * @returns {Function} returns.actions.importAssetsFromClipboard - Import assets from clipboard
 * @returns {Function} returns.actions.clearImportedAssets - Clear imported assets
 * @returns {Function} returns.actions.applyAssetsFromMap - Apply assets from map
 * @returns {Function} returns.actions.resetState - Reset state to initial values
 * 
 * @example
 * function ShoppingListDialog() {
 *   const { state, actions } = useShoppingListReducer();
 *   
 *   const handleOpenDialog = () => {
 *     actions.toggleIsOpen();
 *   };
 *   
 *   const handleImportAssets = (assets) => {
 *     actions.importAssetsFromClipboard(assets);
 *   };
 *   
 *   return (
 *     <div>
 *       {state.isOpen && (
 *         <div>
 *           Building: {state.buildingShoppingList ? 'Yes' : 'No'}
 *           Assets imported: {state.assetsImportedFromClipboard ? 'Yes' : 'No'}
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 */
export default function useShoppingListReducer() {
    /**
     * Creates the initial state for the shopping list dialog.
     * 
     * Determines initial values based on current user data and application settings,
     * including parent user information, available characters, and default asset locations.
     * 
     * @returns {Object} Initial state object
     * @returns {boolean} returns.isOpen - Dialog closed by default
     * @returns {boolean} returns.isLoading - Loading state starts as true
     * @returns {boolean} returns.buildingShoppingList - Building mode enabled by default
     * @returns {Array} returns.requestedJobIDs - Empty job IDs array
     * @returns {Object|null} returns.shoppingList - No shopping list initially
     * @returns {boolean} returns.displayChildJobMaterials - Child materials hidden by default
     * @returns {boolean} returns.useAssets - Asset usage disabled by default
     * @returns {boolean} returns.assetsImportedFromClipboard - No clipboard import initially
     * @returns {boolean} returns.useCorporationAssets - Corporation assets disabled by default
     * @returns {Array} returns.assetLocations - Empty asset locations array
     * @returns {number|null} returns.selectedAssetLocation - Default asset location from settings
     * @returns {string|null} returns.selectedCharacter - All users if multiple, parent user if single
     * @returns {number|null} returns.selectedCorporation - Parent user's corporation ID
     */
    const createInitialState = () => ({
        isOpen: false,
        isLoading: true,
        buildingShoppingList: true,
        requestedJobIDs: [],
        shoppingList: null,
        displayChildJobMaterials: false,
        assetType: null, // null, "character", or "corporation"
        assetsImportedFromClipboard: false,
        assetLocations: [],
        selectedAssetLocation: useUsersStore.getState().applicationSettings.defaultAssetLocation,
        selectedCharacter: useUsersStore.getState().users.userArray.length > 1
            ? "allUsers"
            : useUsersStore.getState().users.actions.findParentUser().CharacterHash,
        selectedCorporation: useUsersStore.getState().users.actions.findParentUser().corporation_id || useUsersStore.getState().users.actions.findParentUser().corporation_id,
        selectedCorporationOffice: null,
        selectedCorporationHangar: null,
        appliedAssetsCount: 0,
        appliedAssetsDetails: [], // Array of { name, quantity } objects
    });

    const initialState = createInitialState();

    const [state, dispatch] = useReducer((state, action) => shoppingListReducer(state, action, createInitialState), initialState);

    /**
     * Action dispatchers for the shopping list dialog state.
     * 
     * Provides convenient methods to dispatch actions to the reducer,
     * abstracting away the action creation and dispatch logic.
     * 
     * Memoized to prevent recreation on each render, which would cause
     * effects that depend on these actions to re-run unnecessarily.
     */
    const actions = useMemo(() => ({
        /**
         * Toggles the dialog open/closed state.
         * 
         * @example
         * actions.toggleIsOpen();
         */
        toggleIsOpen: () => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.TOGGLE_IS_OPEN });
        },
        /**
         * Toggles the loading state.
         * 
         * @example
         * actions.toggleIsLoading();
         */
        toggleIsLoading: () => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.TOGGLE_IS_LOADING });
        },
        /**
         * Sets the loading state to a specific value.
         * 
         * @param {boolean} value - Loading state value
         * 
         * @example
         * actions.setIsLoading(true); // Start loading
         * actions.setIsLoading(false); // Stop loading
         */
        setIsLoading: (value) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_IS_LOADING, payload: value });
        },
        /**
         * Toggles the shopping list building mode.
         * 
         * @example
         * actions.toggleBuildingShoppingList();
         */
        toggleBuildingShoppingList: () => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.TOGGLE_BUILDING_SHOPPING_LIST });
        },
        /**
         * Sets the requested job IDs array.
         * 
         * @param {Array} data - Array of job IDs to request
         * 
         * @example
         * actions.setRequestedJobIDs(['job-1', 'job-2', 'job-3']);
         */
        setRequestedJobIDs: (data) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_REQUESTED_JOB_IDS, payload: data });
        },
        /**
         * Toggles the display of child job materials.
         * 
         * @example
         * actions.toggleDisplayChildJobMaterials();
         */
        toggleDisplayChildJobMaterials: () => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.TOGGLE_DISPLAY_CHILD_JOB_MATERIALS });
        },
        /**
         * Sets the asset type (null, "character", or "corporation").
         * Automatically clears assets and resets to defaults when switching types or turning off.
         * 
         * @param {string|null} assetType - Asset type: null (off), "character", or "corporation"
         * 
         * @example
         * actions.setAssetType("character"); // Enable character assets
         * actions.setAssetType("corporation"); // Switch to corporation assets
         * actions.setAssetType(null); // Turn off assets
         */
        setAssetType: (assetType) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_ASSET_TYPE, payload: assetType });
        },
        /**
         * Toggles the assets imported from clipboard status.
         * 
         * @example
         * actions.toggleAssetsImportedFromClipboard();
         */
        toggleAssetsImportedFromClipboard: () => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.TOGGLE_ASSETS_IMPORTED_FROM_CLIPBOARD });
        },
        /**
         * Sets the asset locations data.
         * 
         * @param {Array} data - Asset locations array
         * 
         * @example
         * const locations = [
         *   { id: 60003760, name: 'Jita IV - Moon 4', type: 'station' },
         *   { id: 60008494, name: 'Amarr VIII', type: 'station' }
         * ];
         * actions.setAssetLocations(locations);
         */
        setAssetLocations: (data) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_ASSET_LOCATIONS, payload: data });
        },
        /**
         * Sets the selected character.
         * 
         * @param {string|null} data - Character hash to select
         * 
         * @example
         * actions.setSelectedCharacter('character-hash-123');
         * actions.setSelectedCharacter('allUsers'); // Select all users
         */
        setSelectedCharacter: (data) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_CHARACTER, payload: data });
        },
        /**
         * Sets the selected asset location.
         * 
         * @param {number|null} data - Asset location ID to select
         * 
         * @example
         * actions.setSelectedAssetLocation(60003760); // Jita station
         * actions.setSelectedAssetLocation(null); // Clear selection
         */
        setSelectedAssetLocation: (data) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_ASSET_LOCATION, payload: data });
        },
        /**
         * Sets the selected corporation.
         * 
         * @param {number|null} data - Corporation ID to select
         * 
         * @example
         * actions.setSelectedCorporation(123456789);
         * actions.setSelectedCorporation(null); // Clear corporation selection
         */
        setSelectedCorporation: (data) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_CORPORATION, payload: data });
        },

        /**
         * Sets the selected corporation office.
         * 
         * @param {number|null} data - Corporation office ID to select
         * 
         * @example
         * actions.setSelectedCorporationOffice(123456789);
         * actions.setSelectedCorporationOffice(null); // Clear corporation office selection
         */
        setSelectedCorporationOffice: (data) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_CORPORATION_OFFICE, payload: data });
        },
        /**
         * Sets the selected corporation hangar.
         * 
         * @param {number|null} data - Corporation hangar ID to select
         * 
         * @example
         * actions.setSelectedCorporationHangar(123456789);
         * actions.setSelectedCorporationHangar(null); // Clear corporation hangar selection
         */
        setSelectedCorporationHangar: (data) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_CORPORATION_HANGAR, payload: data });
        },
        /**
         * Sets the shopping list object.
         * 
         * @param {Object|null} data - Shopping list object to set
         * 
         * @example
         * const shoppingList = new ShoppingList(jobData);
         * actions.setShoppingList(shoppingList);
         */
        setShoppingList: (data) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.SET_SHOPPING_LIST, payload: data });
        },
        /**
         * Imports assets from clipboard data.
         * 
         * Triggers shopping list calculations after importing assets.
         * 
         * @param {string} importedAssets - Clipboard data containing asset information
         * 
         * @example
         * const clipboardData = "Tritanium\t1000\nPyerite\t500";
         * actions.importAssetsFromClipboard(clipboardData);
         */
        importAssetsFromClipboard: (importedAssets) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.IMPORT_ASSETS_FROM_CLIPBOARD, payload: importedAssets });
        },
        /**
         * Clears imported assets from the shopping list.
         * 
         * Triggers shopping list calculations after clearing assets.
         * 
         * @example
         * actions.clearImportedAssets();
         */
        clearImportedAssets: () => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.CLEAR_IMPORTED_ASSETS });
        },
        /**
         * Applies assets from map data to the shopping list.
         * 
         * Triggers shopping list calculations after applying assets.
         * 
         * @param {Object} assetsByTypeID - Map of assets by type ID
         * @param {boolean} countAssetQuantityFromMap - Whether to count quantities from map
         * 
         * @example
         * const assetsMap = {
         *   34: { quantity: 1000, location: 60003760 },
         *   35: { quantity: 500, location: 60003760 }
         * };
         * actions.applyAssetsFromMap(assetsMap, true);
         */
        applyAssetsFromMap: (assetsByTypeID, countAssetQuantityFromMap) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.APPLY_ASSETS_FROM_MAP, payload: { assetsByTypeID, countAssetQuantityFromMap } });
        },

        /**
         * Toggles the include when copying flag for a specific item by type ID.
         * 
         * @param {number} typeID - Type ID of the item to toggle
         * 
         * @example
         * actions.toggleIncludeWhenCopying(34);
         */
        toggleIncludeWhenCopying: (typeID) => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.TOGGLE_INCLUDE_WHEN_COPYING, payload: typeID });
        },

        /**
         * Resets the state to initial values.
         * 
         * @example
         * actions.resetState();
         */
        resetState: () => {
            dispatch({ type: SHOPPING_LIST_ACTION_TYPES.RESET_STATE });
        },
    }), [dispatch]);


    return {
        state,
        actions
    }
}