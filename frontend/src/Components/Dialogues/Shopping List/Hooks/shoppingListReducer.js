/**
 * Shopping List Reducer for EVE Industry Planner.
 * 
 * Manages state transitions for the shopping list dialogue component, handling actions
 * for dialogue visibility, shopping list building, asset management, character/corporation
 * selection, and clipboard operations. This reducer provides centralised state
 * management for the shopping list functionality.
 * 
 * @fileoverview Reducer for shopping list dialogue state management
 * @author EVE Industry Planner Team
 */

import { normalizeSetIsLoadingPayload } from "../../../../Functions/Helper/setIsLoadingAction";

/**
 * Action types for the shopping list reducer.
 * 
 * Defines all possible action types that can be dispatched to modify
 * the shopping list dialogue state. Each action type corresponds to a specific
 * state change operation.
 * 
 * @constant {Object} SHOPPING_LIST_ACTION_TYPES
 * @property {string} TOGGLE_IS_OPEN - Toggle dialogue open/closed state
 * @property {string} TOGGLE_IS_LOADING - Toggle loading state
 * @property {string} SET_IS_LOADING - Set loading state to specific value
 * @property {string} TOGGLE_BUILDING_SHOPPING_LIST - Toggle shopping list building mode
 * @property {string} TOGGLE_DISPLAY_CHILD_JOB_MATERIALS - Toggle child job materials display
 * @property {string} TOGGLE_USE_ASSETS - Toggle asset usage
 * @property {string} TOGGLE_ASSETS_IMPORTED_FROM_CLIPBOARD - Toggle clipboard import status
 * @property {string} TOGGLE_USE_CORPORATION_ASSETS - Toggle corporation assets usage
 * @property {string} SET_ASSET_LOCATIONS - Set asset locations data
 * @property {string} SET_SELECTED_CHARACTER - Set selected character
 * @property {string} SET_SELECTED_ASSET_LOCATION - Set selected asset location
 * @property {string} SET_SELECTED_CORPORATION - Set selected corporation
 * @property {string} SET_SHOPPING_LIST - Set shopping list object
 * @property {string} IMPORT_ASSETS_FROM_CLIPBOARD - Import assets from clipboard
 * @property {string} CLEAR_IMPORTED_ASSETS - Clear imported assets
 * @property {string} APPLY_ASSETS_FROM_MAP - Apply assets from map data
 * @property {string} RESET_STATE - Reset the entire state to initial values
 */
export const SHOPPING_LIST_ACTION_TYPES = {
    TOGGLE_IS_OPEN: "TOGGLE_IS_OPEN",
    TOGGLE_IS_LOADING: "TOGGLE_IS_LOADING",
    SET_IS_LOADING: "SET_IS_LOADING",
    TOGGLE_BUILDING_SHOPPING_LIST: "TOGGLE_BUILDING_SHOPPING_LIST",
    TOGGLE_DISPLAY_CHILD_JOB_MATERIALS: "TOGGLE_DISPLAY_CHILD_JOB_MATERIALS",
    SET_ASSET_TYPE: "SET_ASSET_TYPE", // null, "character", or "corporation"
    TOGGLE_ASSETS_IMPORTED_FROM_CLIPBOARD: "TOGGLE_ASSETS_IMPORTED_FROM_CLIPBOARD",
    SET_ASSET_LOCATIONS: "SET_ASSET_LOCATIONS",
    SET_SELECTED_CHARACTER: "SET_SELECTED_CHARACTER",
    SET_SELECTED_ASSET_LOCATION: "SET_SELECTED_ASSET_LOCATION",
    SET_SELECTED_CORPORATION: "SET_SELECTED_CORPORATION",
    SET_SELECTED_CORPORATION_OFFICE: "SET_SELECTED_CORPORATION_OFFICE",
    SET_SELECTED_CORPORATION_HANGAR: "SET_SELECTED_CORPORATION_HANGAR",
    SET_SHOPPING_LIST: "SET_SHOPPING_LIST",
    IMPORT_ASSETS_FROM_CLIPBOARD: "IMPORT_ASSETS_FROM_CLIPBOARD",
    CLEAR_IMPORTED_ASSETS: "CLEAR_IMPORTED_ASSETS",
    APPLY_ASSETS_FROM_MAP: "APPLY_ASSETS_FROM_MAP",
    TOGGLE_INCLUDE_WHEN_COPYING: "TOGGLE_INCLUDE_WHEN_COPYING",
    RESET_STATE: "RESET_STATE",
}

/**
 * Reducer function for managing shopping list dialogue state.
 * 
 * Handles state transitions based on action types, providing immutable
 * state updates for the shopping list dialogue component. Includes special
 * handling for shopping list operations that trigger calculations.
 * 
 * @param {Object} state - Current state object
 * @param {boolean} state.isOpen - Whether the dialogue is open
 * @param {boolean} state.isLoading - Loading state
 * @param {boolean} state.buildingShoppingList - Whether building shopping list
 * @param {Array} state.requestedJobIDs - Array of requested job IDs
 * @param {Object|null} state.shoppingList - Shopping list object
 * @param {boolean} state.displayChildJobMaterials - Whether to display child job materials
 * @param {boolean} state.useAssets - Whether to use assets
 * @param {boolean} state.assetsImportedFromClipboard - Whether assets imported from clipboard
 * @param {boolean} state.useCorporationAssets - Whether to use corporation assets
 * @param {Array} state.assetLocations - Asset locations data
 * @param {string|null} state.selectedCharacter - Selected character hash
 * @param {number|null} state.selectedAssetLocation - Selected asset location ID
 * @param {number|null} state.selectedCorporation - Selected corporation ID
 * @param {Object} action - Action object containing type and payload
 * @param {string} action.type - Action type from SHOPPING_LIST_ACTION_TYPES
 * @param {*} [action.payload] - Action payload data
 * @param {Function} createInitialState - Function to create initial state
 * @returns {Object} New state object
 * 
 * @example
 * const newState = shoppingListReducer(currentState, {
 *   type: SHOPPING_LIST_ACTION_TYPES.SET_SHOPPING_LIST,
 *   payload: shoppingListObject
 * }, createInitialState);
 */
export function shoppingListReducer(state, action, createInitialState) {
    switch (action.type) {
        case SHOPPING_LIST_ACTION_TYPES.TOGGLE_IS_OPEN:
            return { ...state, isOpen: !state.isOpen };
        case SHOPPING_LIST_ACTION_TYPES.TOGGLE_IS_LOADING:
            return {
                ...state,
                isLoading: !state.isLoading,
                loadingMessage: undefined,
            };
        case SHOPPING_LIST_ACTION_TYPES.SET_IS_LOADING: {
            const { isLoading, loadingMessage } = normalizeSetIsLoadingPayload(
                action.payload,
            );
            return {
                ...state,
                isLoading,
                loadingMessage: isLoading ? loadingMessage : undefined,
            };
        }
        case SHOPPING_LIST_ACTION_TYPES.TOGGLE_BUILDING_SHOPPING_LIST:
            return { ...state, buildingShoppingList: !state.buildingShoppingList };
        case SHOPPING_LIST_ACTION_TYPES.SET_REQUESTED_JOB_IDS:
            return { ...state, requestedJobIDs: action.payload };
        case SHOPPING_LIST_ACTION_TYPES.TOGGLE_DISPLAY_CHILD_JOB_MATERIALS:
            return { ...state, displayChildJobMaterials: !state.displayChildJobMaterials };
        case SHOPPING_LIST_ACTION_TYPES.SET_ASSET_TYPE:
            // When switching asset types or turning off, clear assets and reset to defaults
            const newAssetType = action.payload;
            const previousAssetType = state.assetType;
            
            // Clear assets when turning off or switching types
            if (state.shoppingList && (newAssetType === null || newAssetType !== previousAssetType)) {
                state.shoppingList.clearAssetQuantities();
                state.shoppingList.calculateVisibleItems(state);
                state.shoppingList.calculateTotalVolume();
                state.shoppingList.calculateTotalValue();
            }
            
            // Clear applied assets info when switching types
            const clearedAssetsInfo = {
                appliedAssetsCount: 0,
                appliedAssetsDetails: [],
            };
            
            // Reset to defaults when switching types
            if (newAssetType === null) {
                // Turning off - reset everything
                return {
                    ...state,
                    assetType: null,
                    selectedCharacter: createInitialState().selectedCharacter,
                    selectedAssetLocation: createInitialState().selectedAssetLocation,
                    selectedCorporation: createInitialState().selectedCorporation,
                    selectedCorporationOffice: null,
                    selectedCorporationHangar: null,
                    assetLocations: [],
                    ...clearedAssetsInfo,
                };
            } else if (newAssetType === "character" && previousAssetType === "corporation") {
                // Switching from corporation to character - reset corporation fields
                return {
                    ...state,
                    assetType: "character",
                    selectedCorporation: createInitialState().selectedCorporation,
                    selectedCorporationOffice: null,
                    selectedCorporationHangar: null,
                    ...clearedAssetsInfo,
                };
            } else if (newAssetType === "corporation" && previousAssetType === "character") {
                // Switching from character to corporation - reset character fields
                return {
                    ...state,
                    assetType: "corporation",
                    selectedCharacter: createInitialState().selectedCharacter,
                    selectedAssetLocation: createInitialState().selectedAssetLocation,
                    assetLocations: [],
                    ...clearedAssetsInfo,
                };
            }
            
            return { ...state, assetType: newAssetType, ...clearedAssetsInfo };
        case SHOPPING_LIST_ACTION_TYPES.TOGGLE_ASSETS_IMPORTED_FROM_CLIPBOARD:
            return { ...state, assetsImportedFromClipboard: !state.assetsImportedFromClipboard };
        case SHOPPING_LIST_ACTION_TYPES.SET_ASSET_LOCATIONS:
            return { ...state, assetLocations: action.payload };
        case SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_CHARACTER:
            return { ...state, selectedCharacter: action.payload };
        case SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_ASSET_LOCATION:
            return { ...state, selectedAssetLocation: action.payload };
        case SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_CORPORATION:
            return { ...state, selectedCorporation: action.payload, selectedCorporationOffice: null, selectedCorporationHangar: null };
        case SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_CORPORATION_OFFICE:
            return { ...state, selectedCorporationOffice: action.payload, selectedCorporationHangar: null };
        case SHOPPING_LIST_ACTION_TYPES.SET_SELECTED_CORPORATION_HANGAR:
            return { ...state, selectedCorporationHangar: action.payload };
        case SHOPPING_LIST_ACTION_TYPES.SET_SHOPPING_LIST:
            return { ...state, shoppingList: action.payload };
        case SHOPPING_LIST_ACTION_TYPES.IMPORT_ASSETS_FROM_CLIPBOARD:
            state.shoppingList.clearAssetQuantities();
            state.shoppingList.importAssetsFromClipboard(action.payload);
            state.shoppingList.calculateVisibleItems(state);
            state.shoppingList.calculateTotalVolume();
            state.shoppingList.calculateTotalValue();
            
            // Calculate applied assets count and details
            const clipboardAppliedAssetsDetails = state.shoppingList.items
                .filter(item => item.assetQuantity > 0)
                .map(item => ({
                    name: item.name,
                    quantity: item.assetQuantity,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
            
            const clipboardAppliedAssetsCount = clipboardAppliedAssetsDetails.length;
            
            return { 
                ...state, 
                assetsImportedFromClipboard: true, 
                assetType: null,
                appliedAssetsCount: clipboardAppliedAssetsCount,
                appliedAssetsDetails: clipboardAppliedAssetsDetails,
            };
        case SHOPPING_LIST_ACTION_TYPES.CLEAR_IMPORTED_ASSETS:
            state.shoppingList.clearAssetQuantities();
            state.shoppingList.calculateVisibleItems(state);
            state.shoppingList.calculateTotalVolume();
            state.shoppingList.calculateTotalValue();
            return { 
                ...state, 
                assetsImportedFromClipboard: false,
                appliedAssetsCount: 0,
                appliedAssetsDetails: [],
            };
        case SHOPPING_LIST_ACTION_TYPES.APPLY_ASSETS_FROM_MAP:
            state.shoppingList.applyAssetsFromMap(action.payload.assetsByTypeID, action.payload.countAssetQuantityFromMap);
            state.shoppingList.calculateVisibleItems(state);
            state.shoppingList.calculateTotalVolume();
            state.shoppingList.calculateTotalValue();
            
            // Calculate applied assets count and details
            const appliedAssetsDetails = state.shoppingList.items
                .filter(item => item.assetQuantity > 0)
                .map(item => ({
                    name: item.name,
                    quantity: item.assetQuantity,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
            
            const appliedAssetsCount = appliedAssetsDetails.length;
            
            return { 
                ...state, 
                assetsAppliedFromMap: true,
                appliedAssetsCount,
                appliedAssetsDetails,
            };
        case SHOPPING_LIST_ACTION_TYPES.TOGGLE_INCLUDE_WHEN_COPYING:
            state.shoppingList.toggleIncludeWhenCopying(action.payload);
            state.shoppingList.calculateVisibleItems(state);
            state.shoppingList.calculateTotalVolume();
            state.shoppingList.calculateTotalValue();
            return { ...state };
        case SHOPPING_LIST_ACTION_TYPES.RESET_STATE:
            return createInitialState();
        default:
            return state;
    }
}