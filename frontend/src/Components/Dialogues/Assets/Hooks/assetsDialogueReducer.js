/**
 * Assets Dialog Reducer for EVE Industry Planner.
 */

import { normalizeSetIsLoadingPayload } from "../../../../Functions/Helper/setIsLoadingAction";

/**
 * Action types for the assets dialogue reducer.
 *
 * @constant {Object} ASSETS_DIALOGUE_ACTION_TYPES
 * @property {string} RESET_STATE - Reset the entire state to initial values
 * @property {string} TOGGLE_IS_OPEN - Toggle dialogue open/closed state
 * @property {string} SET_SELECTED_TYPE_ID - Set the selected item type ID
 * @property {string} SET_IS_LOADING - Set loading state
 * @property {string} TOGGLE_USE_CORPORATION_ASSETS - Toggle corporation assets usage
 * @property {string} SET_SELECTED_CHARACTER - Set selected character
 * @property {string} SET_SELECTED_CORPORATION - Set selected corporation
 * @property {string} SET_ASSET_LOCATIONS - Set asset locations data
 * @property {string} SET_TOP_LEVEL_ASSETS - Set top-level assets data
 * @property {string} SET_ASSET_LOCATION_NAMES - Set asset location names
 * @property {string} SET_FULL_ITEM_LIST - Set full item list data
 */
export const ASSETS_DIALOGUE_ACTION_TYPES = {
    RESET_STATE: "RESET_STATE",
    TOGGLE_IS_OPEN: "TOGGLE_IS_OPEN",
    SET_SELECTED_TYPE_ID: "SET_SELECTED_TYPE_ID",
    SET_IS_LOADING: "SET_IS_LOADING",
    TOGGLE_USE_CORPORATION_ASSETS: "TOGGLE_USE_CORPORATION_ASSETS",
    SET_SELECTED_CHARACTER: "SET_SELECTED_CHARACTER",
    SET_SELECTED_CORPORATION: "SET_SELECTED_CORPORATION",
    SET_ASSET_LOCATIONS: "SET_ASSET_LOCATIONS",
    SET_TOP_LEVEL_ASSETS: "SET_TOP_LEVEL_ASSETS",
    SET_ASSET_LOCATION_NAMES: "SET_ASSET_LOCATION_NAMES",
    SET_FULL_ITEM_LIST: "SET_FULL_ITEM_LIST",
}

/**
 * Reducer function for managing assets dialogue state.
 *
 * @param {Object} state - Current state object
 * @param {boolean} state.isOpen - Whether the dialogue is open
 * @param {number|null} state.selectedTypeID - Selected item type ID
 * @param {boolean} state.isLoading - Loading state
 * @param {boolean} state.useCorporationAssets - Whether to use corporation assets
 * @param {string|null} state.selectedCharacter - Selected character hash
 * @param {number|null} state.selectedCorporation - Selected corporation ID
 * @param {Map} state.assetLocations - Asset locations data
 * @param {Map} state.topLevelAssets - Top-level assets data
 * @param {Map} state.assetLocationNames - Asset location names
 * @param {Object} state.fullItemList - Full item list data
 * @param {Object} action - Action object containing type and payload
 * @param {string} action.type - Action type from ASSETS_DIALOGUE_ACTION_TYPES
 * @param {*} [action.payload] - Action payload data
 * @param {Function} createInitialState - Function to create initial state
 * @returns {Object} New state object
 */
export function assetsDialogueReducer(state, action, createInitialState) {
    switch (action.type) {
        case ASSETS_DIALOGUE_ACTION_TYPES.RESET_STATE:
            return createInitialState();
        case ASSETS_DIALOGUE_ACTION_TYPES.TOGGLE_IS_OPEN:
            return { ...state, isOpen: !state.isOpen };
        case ASSETS_DIALOGUE_ACTION_TYPES.SET_SELECTED_TYPE_ID:
            return { ...state, selectedTypeID: action.payload };
        case ASSETS_DIALOGUE_ACTION_TYPES.SET_IS_LOADING: {
            const { isLoading, loadingMessage } = normalizeSetIsLoadingPayload(
                action.payload,
            );
            return {
                ...state,
                isLoading,
                loadingMessage: isLoading ? loadingMessage : undefined,
            };
        }
        case ASSETS_DIALOGUE_ACTION_TYPES.TOGGLE_USE_CORPORATION_ASSETS:
            return { ...state, useCorporationAssets: !state.useCorporationAssets };
        case ASSETS_DIALOGUE_ACTION_TYPES.SET_SELECTED_CHARACTER:
            return { ...state, selectedCharacter: action.payload };
        case ASSETS_DIALOGUE_ACTION_TYPES.SET_SELECTED_CORPORATION:
            return { ...state, selectedCorporation: action.payload };
        case ASSETS_DIALOGUE_ACTION_TYPES.SET_ASSET_LOCATIONS:
            return { ...state, assetLocations: action.payload };
        case ASSETS_DIALOGUE_ACTION_TYPES.SET_TOP_LEVEL_ASSETS:
            return { ...state, topLevelAssets: action.payload };
        case ASSETS_DIALOGUE_ACTION_TYPES.SET_ASSET_LOCATION_NAMES:
            return { ...state, assetLocationNames: action.payload };
        case ASSETS_DIALOGUE_ACTION_TYPES.SET_FULL_ITEM_LIST:
            return { ...state, fullItemList: action.payload };
        default:
            return state;
    }
}