/**
 * Reprocessing Reducer Hook for EVE Industry Planner.
 * 
 * Custom React hook that provides state management for the reprocessing page component.
 * Uses useReducer with a custom reducer to handle complex reprocessing calculations,
 * skill management, structure configuration, market settings, and ore filtering.
 * 
 * @fileoverview Custom hook for reprocessing page state management
 * @author EVE Industry Planner Team
 */

import { useReducer } from "react";
import {
  reprocessingReducer,
  REPROCESSING_ACTION_TYPES,
} from "./reprocessingReducer";
import ReprocessingStructure from "../../../Classes/reprocessingStructure";
import useUsersStore from "../../../Zustand/usersStore";
import { jobTypes } from "../../../Context/defaultValues";
import GLOBAL_CONFIG from "../../../global-config-app";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION } = GLOBAL_CONFIG;

/**
 * Custom hook for managing reprocessing page state.
 * 
 * Provides a reducer-based state management solution for the reprocessing page,
 * including initial state creation based on user settings, action dispatching,
 * and state access. The hook manages complex reprocessing operations including
 * calculations, skill management, structure configuration, and market settings.
 * 
 * @returns {Object} Hook return object
 * @returns {Object} returns.state - Current page state
 * @returns {Array} returns.state.reprocessingObjects - Reprocessing calculation results
 * @returns {Array} returns.state.processedInput - Processed input data
 * @returns {string} returns.state.inputText - Raw input text
 * @returns {boolean} returns.state.toMinerals - Whether to output minerals or materials
 * @returns {boolean} returns.state.displayAdvancedView - Whether to show advanced view
 * @returns {boolean} returns.state.isPageLoading - Page loading state
 * @returns {Object} returns.state.currentStructure - Current reprocessing structure
 * @returns {Object} returns.state.activeSkills - Active skill levels by skill ID
 * @returns {string|null} returns.state.selectedUser - Selected user character hash
 * @returns {boolean} returns.state.skillsManuallyModified - Whether skills were manually modified
 * @returns {Object} returns.state.rigSlotErrors - Rig slot validation errors
 * @returns {Array} returns.state.oreIDsToBeIgnored - Array of ore IDs to ignore
 * @returns {string} returns.state.marketLocation - Market location for pricing
 * @returns {string} returns.state.marketListing - Market listing type (buy/sell)
 * @returns {boolean} returns.state.inputModified - Whether input has been modified
 * @returns {Object} returns.state.requestedMinerals - Requested minerals data
 * @returns {Object} returns.state.reprocessingCalculationSettings - Calculation settings
 * @returns {Object} returns.actions - Action dispatchers
 * @returns {Function} returns.actions.setReprocessingObjects - Set reprocessing results
 * @returns {Function} returns.actions.setProcessedInput - Set processed input data
 * @returns {Function} returns.actions.setInputText - Set raw input text
 * @returns {Function} returns.actions.toggleToMinerals - Toggle output type
 * @returns {Function} returns.actions.setPageLoading - Set loading state
 * @returns {Function} returns.actions.toggleDisplayAdvancedView - Toggle advanced view
 * @returns {Function} returns.actions.setCurrentStructure - Set reprocessing structure
 * @returns {Function} returns.actions.setSingleSkill - Set individual skill level
 * @returns {Function} returns.actions.setAllSkills - Set all skills at once
 * @returns {Function} returns.actions.setSelectedUser - Set selected user
 * @returns {Function} returns.actions.setSkillsManuallyModified - Set manual modification flag
 * @returns {Function} returns.actions.loadCharacterSkills - Load character skills
 * @returns {Function} returns.actions.setRigSlotErrors - Set rig slot errors
 * @returns {Function} returns.actions.addOreIDToBeIgnored - Add ore ID to ignore list
 * @returns {Function} returns.actions.removeOreIDToBeIgnored - Remove ore ID from ignore list
 * @returns {Function} returns.actions.clearOreIDsToBeIgnored - Clear all ignored ore IDs
 * @returns {Function} returns.actions.setMarketLocation - Set market location
 * @returns {Function} returns.actions.setMarketListing - Set market listing type
 * @returns {Function} returns.actions.setInputModified - Set input modification flag
 * @returns {Function} returns.actions.setRequestedMinerals - Set requested minerals
 * @returns {Function} returns.actions.setReprocessingCalculationSettings - Set calculation settings
 * 
 * @example
 * function ReprocessingPage() {
 *   const { state, actions } = useReprocessingReducer();
 *   
 *   const handleCalculate = (data) => {
 *     actions.setReprocessingObjects(data);
 *   };
 *   
 *   const handleSkillChange = (skillId, level) => {
 *     actions.setSingleSkill(skillId, level);
 *   };
 *   
 *   return (
 *     <div>
 *       Output type: {state.toMinerals ? 'Minerals' : 'Materials'}
 *       Advanced view: {state.displayAdvancedView ? 'On' : 'Off'}
 *       Loading: {state.isPageLoading ? 'Yes' : 'No'}
 *     </div>
 *   );
 * }
 */
export default function useReprocessingReducer() {
  const getDefaultReprocessingStructure = useUsersStore(
    (state) =>
      state.applicationSettings.actions.getDefaultCustomStructureWithJobType
  );
  const { getDefaultReprocessingCharacter } =
    useUsersStore.getState().applicationSettings.actions;
  const defaultMarketLocation = useUsersStore(
    (state) => state.applicationSettings.defaultMarketLocation
  );
  const defaultOrderType = useUsersStore(
    (state) => state.applicationSettings.defaultOrderType
  );

  const characters = useUsersStore((state) => state.account.characters);

  const initialState = {
    reprocessingObjects: [],
    processedInput: [],
    inputText: "",
    toMinerals: true,
    displayAdvancedView: false,
    isPageLoading: false,
    currentStructure:
      getDefaultReprocessingStructure(jobTypes.reprocessing) ||
      new ReprocessingStructure(),
    activeSkills: {},
    selectedUser:
      getDefaultReprocessingCharacter(characters)?.CharacterHash ||
      useUsersStore.getState().account.actions.getMainCharacterHash() ||
      null,
    skillsManuallyModified: false,
    rigSlotErrors: { slot1: false, slot2: false },
    oreIDsToBeIgnored: [],
    marketLocation: defaultMarketLocation || DEFAULT_MARKET_OPTION,
    marketListing: defaultOrderType || DEFAULT_ORDER_OPTION,
    inputModified: false,
    requestedMinerals: {},
    reprocessingCalculationSettings: (() => {
      const rs =
        useUsersStore.getState().applicationSettings.reprocessingSettings;
      return {
        preferCompressed: rs.preferCompressed,
        compressionBonusMultiplier: rs.compressionBonusMultiplier,
        valueMultiplier: rs.valueMultiplier,
        wastePenaltyMultiplier: rs.wastePenaltyMultiplier,
        sellExcessMineralTypes: rs.sellExcessMineralTypes,
      };
    })(),
  };

  const [state, dispatch] = useReducer(reprocessingReducer, initialState);

  /**
   * Action dispatchers for the reprocessing page state.
   * 
   * Provides convenient methods to dispatch actions to the reducer,
 * abstracting away the action creation and dispatch logic.
   */
  const actions = {
    /**
     * Sets the reprocessing calculation results.
     * 
     * @param {Array} data - Reprocessing calculation results
     * 
     * @example
     * actions.setReprocessingObjects(reprocessingResults);
     */
    setReprocessingObjects: (data) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_REPROCESSING_OBJECTS,
        payload: data,
      });
    },
    /**
     * Sets the processed input data.
     * 
     * @param {Array} data - Processed input data
     * 
     * @example
     * actions.setProcessedInput(processedData);
     */
    setProcessedInput: (data) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_PROCESSED_INPUT,
        payload: data,
      });
    },
    /**
     * Sets the raw input text.
     * 
     * @param {string} data - Raw input text
     * 
     * @example
     * actions.setInputText("Tritanium\t1000\nPyerite\t500");
     */
    setInputText: (data) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_INPUT_TEXT,
        payload: data,
      });
    },
    /**
     * Toggles between minerals and materials output.
     * 
     * @example
     * actions.toggleToMinerals();
     */
    toggleToMinerals: () => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.TOGGLE_TO_MINERALS,
      });
    },
    /**
     * Sets the page loading state.
     * 
     * @param {boolean} data - Loading state value
     * 
     * @example
     * actions.setPageLoading(true); // Start loading
     * actions.setPageLoading(false); // Stop loading
     */
    setPageLoading: (data) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_PAGE_LOADING,
        payload: data,
      });
    },
    /**
     * Toggles the advanced view display.
     * 
     * @example
     * actions.toggleDisplayAdvancedView();
     */
    toggleDisplayAdvancedView: () => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.TOGGLE_DISPLAY_ADVANCED_VIEW,
      });
    },
    /**
     * Sets the current reprocessing structure.
     * 
     * @param {Object} data - Reprocessing structure object
     * 
     * @example
     * actions.setCurrentStructure(new ReprocessingStructure());
     */
    setCurrentStructure: (data) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_CURRENT_STRUCTURE,
        payload: data,
      });
    },
    /**
     * Sets an individual skill level and marks skills as manually modified.
     * 
     * @param {number} id - Skill ID
     * @param {number} level - Skill level (0-5)
     * 
     * @example
     * actions.setSingleSkill(3385, 5); // Set Reprocessing to level 5
     */
    setSingleSkill: (id, level) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_SINGLE_SKILL,
        payload: { id, level },
      });
    },
    /**
     * Sets all skills at once and resets manual modification flag.
     * 
     * @param {Object} skills - Skills object with skill IDs as keys and levels as values
     * 
     * @example
     * actions.setAllSkills({ 3385: 5, 3386: 4, 3387: 3 });
     */
    setAllSkills: (skills) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_ALL_SKILLS,
        payload: skills,
      });
    },
    /**
     * Sets the selected user character and resets manual modification flag.
     * 
     * @param {string} userHash - User character hash
     * 
     * @example
     * actions.setSelectedUser('character-hash-123');
     */
    setSelectedUser: (userHash) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_SELECTED_USER,
        payload: userHash,
      });
    },
    /**
     * Sets the manual skill modification flag.
     * 
     * @param {boolean} modified - Whether skills were manually modified
     * 
     * @example
     * actions.setSkillsManuallyModified(true);
     */
    setSkillsManuallyModified: (modified) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_SKILLS_MANUALLY_MODIFIED,
        payload: modified,
      });
    },
    /**
     * Loads character skills and resets manual modification flag.
     * 
     * @param {Object} skills - Character skills object
     * 
     * @example
     * actions.loadCharacterSkills({ 3385: 5, 3386: 4 });
     */
    loadCharacterSkills: (skills) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.LOAD_CHARACTER_SKILLS,
        payload: { skills },
      });
    },
    /**
     * Sets rig slot validation errors.
     * 
     * @param {Object} errors - Rig slot errors object
     * 
     * @example
     * actions.setRigSlotErrors({ slot1: true, slot2: false });
     */
    setRigSlotErrors: (errors) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_RIG_SLOT_ERRORS,
        payload: errors,
      });
    },
    /**
     * Adds an ore ID to the ignore list.
     * 
     * @param {number} id - Ore type ID to ignore
     * 
     * @example
     * actions.addOreIDToBeIgnored(12345); // Ignore specific ore type
     */
    addOreIDToBeIgnored: (id) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.ADD_ORE_ID_TO_BE_IGNORED,
        payload: id,
      });
    },
    /**
     * Removes an ore ID from the ignore list.
     * 
     * @param {number} id - Ore type ID to remove from ignore list
     * 
     * @example
     * actions.removeOreIDToBeIgnored(12345);
     */
    removeOreIDToBeIgnored: (id) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.REMOVE_ORE_ID_TO_BE_IGNORED,
        payload: id,
      });
    },
    /**
     * Clears all ignored ore IDs.
     * 
     * @example
     * actions.clearOreIDsToBeIgnored();
     */
    clearOreIDsToBeIgnored: () => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.CLEAR_ORE_IDS_TO_BE_IGNORED,
      });
    },
    /**
     * Sets the market location for pricing.
     * 
     * @param {string} location - Market location (e.g., 'jita', 'amarr')
     * 
     * @example
     * actions.setMarketLocation('jita');
     */
    setMarketLocation: (location) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_MARKET_LOCATION,
        payload: location,
      });
    },
    /**
     * Sets the market listing type (buy/sell).
     * 
     * @param {string} listing - Market listing type ('buy' or 'sell')
     * 
     * @example
     * actions.setMarketListing('sell');
     */
    setMarketListing: (listing) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_MARKET_LISTING,
        payload: listing,
      });
    },
    /**
     * Sets the input modification flag.
     * 
     * @param {boolean} modified - Whether input has been modified
     * 
     * @example
     * actions.setInputModified(true);
     */
    setInputModified: (modified) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_INPUT_MODIFIED,
        payload: modified,
      });
    },
    /**
     * Sets the requested minerals data.
     * 
     * @param {Object} minerals - Requested minerals object
     * 
     * @example
     * actions.setRequestedMinerals({ 34: 1000, 35: 500 });
     */
    setRequestedMinerals: (minerals) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_REQUESTED_MINERALS,
        payload: minerals,
      });
    },
    /**
     * Sets the reprocessing calculation settings.
     * 
     * @param {Object} settings - Calculation settings object
     * 
     * @example
     * actions.setReprocessingCalculationSettings({ 
     *   includeWaste: true, 
     *   useSkills: true 
     * });
     */
    setReprocessingCalculationSettings: (settings) => {
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_REPROCESSING_CALCULATION_SETTINGS,
        payload: settings,
      });
    },
  };

  return { state, actions };
}
