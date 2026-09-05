/**
 * Assets Dialog Reducer Hook for EVE Industry Planner.
 *
 * Custom React hook that provides state management for the assets dialogue component.
 * Uses useReducer with a custom reducer to handle complex state transitions for
 * asset selection, character/corporation management, and dialogue interactions.
 */

import { useReducer } from "react";
import {
  ASSETS_DIALOGUE_ACTION_TYPES,
  assetsDialogueReducer,
} from "./assetsDialogueReducer";
import useUsersStore from "../../../../Zustand/usersStore";
import { buildSetIsLoadingActionPayload } from "../../../../Functions/Helper/setIsLoadingAction";

/**
 * Custom hook for managing assets dialogue state.
 *
 * @returns {Object} Hook return object
 * @returns {Object} returns.state - Current dialogue state
 * @returns {boolean} returns.state.isOpen - Whether dialogue is open
 * @returns {number|null} returns.state.selectedTypeID - Selected item type ID
 * @returns {boolean} returns.state.isLoading - Loading state
 * @returns {boolean} returns.state.useCorporationAssets - Whether using corporation assets
 * @returns {string|null} returns.state.selectedCharacter - Selected character hash
 * @returns {number|null} returns.state.selectedCorporation - Selected corporation ID
 * @returns {Map} returns.state.assetLocations - Asset locations data
 * @returns {Map} returns.state.topLevelAssets - Top-level assets data
 * @returns {Map} returns.state.assetLocationNames - Asset location names
 * @returns {Object} returns.state.fullItemList - Full item list data
 * @returns {Object} returns.actions - Action dispatchers
 * @returns {Function} returns.actions.resetState - Reset state to initial values
 * @returns {Function} returns.actions.toggleIsOpen - Toggle dialogue open/closed
 * @returns {Function} returns.actions.setSelectedTypeID - Set selected type ID
 * @returns {Function} returns.actions.toggleIsLoading - Toggle loading state
 * @returns {Function} returns.actions.setIsLoading - Set loading state
 * @returns {Function} returns.actions.toggleUseCorporationAssets - Toggle corporation assets
 * @returns {Function} returns.actions.setSelectedCharacter - Set selected character
 * @returns {Function} returns.actions.setSelectedCorporation - Set selected corporation
 * @returns {Function} returns.actions.setAssetLocations - Set asset locations
 * @returns {Function} returns.actions.setTopLevelAssets - Set top-level assets
 * @returns {Function} returns.actions.setAssetLocationNames - Set asset location names
 * @returns {Function} returns.actions.setFullItemList - Set full item list
 */
export default function useAssetsDialogueReducer() {
  /**
   * Creates the initial state for the assets dialogue.
   *
   * @returns {Object} Initial state object
   * @returns {boolean} returns.isOpen - Dialog closed by default
   * @returns {number|null} returns.selectedTypeID - No type selected initially
   * @returns {boolean} returns.isLoading - Loading state starts as true
   * @returns {boolean} returns.useCorporationAssets - Corporation assets disabled by default
   * @returns {string|null} returns.selectedCharacter - All characters if multiple, main character if single
   * @returns {number|null} returns.selectedCorporation - Main character's corporation ID
   * @returns {Map} returns.assetLocations - Empty asset locations map
   * @returns {Map} returns.topLevelAssets - Empty top-level assets map
   * @returns {Map} returns.assetLocationNames - Empty asset location names map
   * @returns {Object} returns.fullItemList - Empty full item list object
   */
  const createInitialState = () => {
    return {
      isOpen: false,
      selectedTypeID: null,
      isLoading: true,
      useCorporationAssets: false,
      selectedCharacter:
        Object.values(useUsersStore.getState().account.characters).length > 1
          ? "allUsers"
          : useUsersStore.getState().account.mainCharacterHash || null,
      selectedCorporation: useUsersStore.getState().account.actions.getMainCorporation()?.corporation_id || null,
      assetLocations: new Map(),
      topLevelAssets: new Map(),
      assetLocationNames: new Map(),
      fullItemList: {},
    };
  };

  const initialState = createInitialState();

  const [state, dispatch] = useReducer(
    (state, action) => assetsDialogueReducer(state, action, createInitialState),
    initialState
  );

  /**
   * Action dispatchers for the assets dialogue state.
   */
  const actions = {
    /**
     * Resets the state to initial values.
     */
    resetState: () => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.RESET_STATE });
    },
    /**
     * Toggles the dialogue open/closed state.
     */
    toggleIsOpen: () => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.TOGGLE_IS_OPEN });
    },
    /**
     * Sets the selected item type ID.
     *
     * @param {number|null} typeID - Item type ID to select
     */
    setSelectedTypeID: (typeID) => {
      dispatch({
        type: ASSETS_DIALOGUE_ACTION_TYPES.SET_SELECTED_TYPE_ID,
        payload: typeID,
      });
    },
    /**
     * Toggles the loading state.
     */
    toggleIsLoading: () => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.TOGGLE_IS_LOADING });
    },
    /**
     * Sets the loading state to a specific value.
     *
     * @param {boolean} value - Loading state value
     * @param {string} [loadingMessage] - Optional caption while loading
     */
    setIsLoading: (value, loadingMessage) => {
      dispatch({
        type: ASSETS_DIALOGUE_ACTION_TYPES.SET_IS_LOADING,
        payload: buildSetIsLoadingActionPayload(value, loadingMessage),
      });
    },
    /**
     * Toggles the use corporation assets setting.
     */
    toggleUseCorporationAssets: () => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.TOGGLE_USE_CORPORATION_ASSETS });
    },
    /**
     * Sets the selected character.
     *
     * @param {string|null} character - Character hash to select
     */
    setSelectedCharacter: (character) => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.SET_SELECTED_CHARACTER, payload: character });
    },
    /**
     * Sets the selected corporation.
     *
     * @param {number|null} corporation - Corporation ID to select
     */
    setSelectedCorporation: (corporation) => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.SET_SELECTED_CORPORATION, payload: corporation });
    },
    /**
     * Sets the asset locations data.
     *
     * @param {Map} locations - Asset locations map
     */
    setAssetLocations: (locations) => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.SET_ASSET_LOCATIONS, payload: locations });
    },
    /**
     * Sets the top-level assets data.
     *
     * @param {Map} assets - Top-level assets map
     */
    setTopLevelAssets: (assets) => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.SET_TOP_LEVEL_ASSETS, payload: assets });
    },
    /**
     * Sets the asset location names data.
     *
     * @param {Map} names - Asset location names map
     */
    setAssetLocationNames: (names) => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.SET_ASSET_LOCATION_NAMES, payload: names });
    },
    /**
     * Sets the full item list data.
     *
     * @param {Object} list - Full item list object
     */
    setFullItemList: (list) => {
      dispatch({ type: ASSETS_DIALOGUE_ACTION_TYPES.SET_FULL_ITEM_LIST, payload: list });
    },
  };

  return {
    state,
    actions,
  };
}
