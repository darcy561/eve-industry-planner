/**
 * Assets Dialog Reducer Hook for EVE Industry Planner.
 * 
 * Custom React hook that provides state management for the assets dialog component.
 * Uses useReducer with a custom reducer to handle complex state transitions for
 * asset selection, character/corporation management, and dialog interactions.
 * 
 * @fileoverview Custom hook for assets dialog state management
 * @author EVE Industry Planner Team
 */

import { useReducer } from "react";
import {
  ASSETS_DIALOG_ACTION_TYPES,
  assetsDialogReducer,
} from "./assetsDialogReducer";
import useUsersStore from "../../../../Zustand/usersStore";

/**
 * Custom hook for managing assets dialog state.
 * 
 * Provides a reducer-based state management solution for the assets dialog,
 * including initial state creation based on current user data, action dispatching,
 * and state access. The hook automatically determines initial values based on
 * the current user's data and available characters.
 * 
 * @returns {Object} Hook return object
 * @returns {Object} returns.state - Current dialog state
 * @returns {boolean} returns.state.isOpen - Whether dialog is open
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
 * @returns {Function} returns.actions.toggleIsOpen - Toggle dialog open/closed
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
 * 
 * @example
 * function AssetsDialog() {
 *   const { state, actions } = useAssetsDialogReducer();
 *   
 *   const handleOpenDialog = () => {
 *     actions.toggleIsOpen();
 *   };
 *   
 *   const handleSelectType = (typeID) => {
 *     actions.setSelectedTypeID(typeID);
 *   };
 *   
 *   return (
 *     <div>
 *       {state.isOpen && (
 *         <div>Dialog is open for type ID: {state.selectedTypeID}</div>
 *       )}
 *     </div>
 *   );
 * }
 */
export default function useAssetsDialogReducer() {
  /**
   * Creates the initial state for the assets dialog.
   * 
   * Determines initial values based on current user data, including
   * main character information, available characters, and default selections.
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
    (state, action) => assetsDialogReducer(state, action, createInitialState),
    initialState
  );

  /**
   * Action dispatchers for the assets dialog state.
   * 
   * Provides convenient methods to dispatch actions to the reducer,
   * abstracting away the action creation and dispatch logic.
   */
  const actions = {
    /**
     * Resets the state to initial values.
     * 
     * @example
     * actions.resetState();
     */
    resetState: () => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.RESET_STATE });
    },
    /**
     * Toggles the dialog open/closed state.
     * 
     * @example
     * actions.toggleIsOpen();
     */
    toggleIsOpen: () => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.TOGGLE_IS_OPEN });
    },
    /**
     * Sets the selected item type ID.
     * 
     * @param {number|null} typeID - Item type ID to select
     * 
     * @example
     * actions.setSelectedTypeID(34); // Select Tritanium
     * actions.setSelectedTypeID(null); // Clear selection
     */
    setSelectedTypeID: (typeID) => {
      dispatch({
        type: ASSETS_DIALOG_ACTION_TYPES.SET_SELECTED_TYPE_ID,
        payload: typeID,
      });
    },
    /**
     * Toggles the loading state.
     * 
     * @example
     * actions.toggleIsLoading();
     */
    toggleIsLoading: () => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.TOGGLE_IS_LOADING });
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
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.SET_IS_LOADING, payload: value });
    },
    /**
     * Toggles the use corporation assets setting.
     * 
     * @example
     * actions.toggleUseCorporationAssets();
     */
    toggleUseCorporationAssets: () => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.TOGGLE_USE_CORPORATION_ASSETS });
    },
    /**
     * Sets the selected character.
     * 
     * @param {string|null} character - Character hash to select
     * 
     * @example
     * actions.setSelectedCharacter('character-hash-123');
     * actions.setSelectedCharacter('allUsers'); // Select all users
     */
    setSelectedCharacter: (character) => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.SET_SELECTED_CHARACTER, payload: character });
    },
    /**
     * Sets the selected corporation.
     * 
     * @param {number|null} corporation - Corporation ID to select
     * 
     * @example
     * actions.setSelectedCorporation(123456789);
     * actions.setSelectedCorporation(null); // Clear corporation selection
     */
    setSelectedCorporation: (corporation) => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.SET_SELECTED_CORPORATION, payload: corporation });
    },
    /**
     * Sets the asset locations data.
     * 
     * @param {Map} locations - Asset locations map
     * 
     * @example
     * const locationsMap = new Map();
     * locationsMap.set(60003760, { name: 'Jita IV - Moon 4', type: 'station' });
     * actions.setAssetLocations(locationsMap);
     */
    setAssetLocations: (locations) => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.SET_ASSET_LOCATIONS, payload: locations });
    },
    /**
     * Sets the top-level assets data.
     * 
     * @param {Map} assets - Top-level assets map
     * 
     * @example
     * const assetsMap = new Map();
     * assetsMap.set(34, { quantity: 1000, location: 60003760 });
     * actions.setTopLevelAssets(assetsMap);
     */
    setTopLevelAssets: (assets) => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.SET_TOP_LEVEL_ASSETS, payload: assets });
    },
    /**
     * Sets the asset location names data.
     * 
     * @param {Map} names - Asset location names map
     * 
     * @example
     * const namesMap = new Map();
     * namesMap.set(60003760, 'Jita IV - Moon 4');
     * actions.setAssetLocationNames(namesMap);
     */
    setAssetLocationNames: (names) => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.SET_ASSET_LOCATION_NAMES, payload: names });
    },
    /**
     * Sets the full item list data.
     * 
     * @param {Object} list - Full item list object
     * 
     * @example
     * const itemList = {
     *   34: { name: 'Tritanium', category: 'Material' },
     *   35: { name: 'Pyerite', category: 'Material' }
     * };
     * actions.setFullItemList(itemList);
     */
    setFullItemList: (list) => {
      dispatch({ type: ASSETS_DIALOG_ACTION_TYPES.SET_FULL_ITEM_LIST, payload: list });
    },
  };

  return {
    state,
    actions,
  };
}
