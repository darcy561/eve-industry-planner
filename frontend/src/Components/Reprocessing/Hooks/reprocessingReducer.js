/**
 * Reprocessing Reducer for EVE Industry Planner.
 * 
 * Manages state transitions for the reprocessing page component, handling actions
 * for reprocessing calculations, skill management, structure configuration, market
 * settings, and ore filtering. This reducer provides centralized state management
 * for complex reprocessing operations.
 * 
 * @fileoverview Reducer for reprocessing page state management
 * @author EVE Industry Planner Team
 */

/**
 * Action types for the reprocessing reducer.
 * 
 * Defines all possible action types that can be dispatched to modify
 * the reprocessing page state. Each action type corresponds to a specific
 * reprocessing operation or configuration change.
 * 
 * @constant {Object} REPROCESSING_ACTION_TYPES
 * @property {string} SET_REPROCESSING_OBJECTS - Set reprocessing calculation results
 * @property {string} SET_PROCESSED_INPUT - Set processed input data
 * @property {string} SET_INPUT_TEXT - Set raw input text
 * @property {string} TOGGLE_TO_MINERALS - Toggle between minerals and materials output
 * @property {string} SET_PAGE_LOADING - Set page loading state
 * @property {string} TOGGLE_DISPLAY_ADVANCED_VIEW - Toggle advanced view display
 * @property {string} SET_CURRENT_STRUCTURE - Set current reprocessing structure
 * @property {string} SET_SINGLE_SKILL - Set individual skill level
 * @property {string} SET_ALL_SKILLS - Set all skills at once
 * @property {string} SET_SELECTED_USER - Set selected user character
 * @property {string} SET_SKILLS_MANUALLY_MODIFIED - Set manual skill modification flag
 * @property {string} LOAD_CHARACTER_SKILLS - Load skills from character data
 * @property {string} SET_RIG_SLOT_ERRORS - Set rig slot validation errors
 * @property {string} ADD_ORE_ID_TO_BE_IGNORED - Add ore ID to ignore list
 * @property {string} REMOVE_ORE_ID_TO_BE_IGNORED - Remove ore ID from ignore list
 * @property {string} CLEAR_ORE_IDS_TO_BE_IGNORED - Clear all ignored ore IDs
 * @property {string} SET_MARKET_LOCATION - Set market location for pricing
 * @property {string} SET_MARKET_LISTING - Set market listing type (buy/sell)
 * @property {string} SET_INPUT_MODIFIED - Set input modification flag
 * @property {string} SET_REQUESTED_MINERALS - Set requested minerals data
 * @property {string} SET_REPROCESSING_CALCULATION_SETTINGS - Set calculation settings
 */
export const REPROCESSING_ACTION_TYPES = {
  SET_REPROCESSING_OBJECTS: "SET_REPROCESSING_OBJECTS",
  SET_PROCESSED_INPUT: "SET_PROCESSED_INPUT",
  SET_INPUT_TEXT: "SET_INPUT_TEXT",
  TOGGLE_TO_MINERALS: "TOGGLE_TO_MINERALS",
  SET_PAGE_LOADING: "SET_PAGE_LOADING",
  TOGGLE_DISPLAY_ADVANCED_VIEW: "TOGGLE_DISPLAY_ADVANCED_VIEW",
  SET_CURRENT_STRUCTURE: "SET_CURRENT_STRUCTURE",
  SET_SINGLE_SKILL: "SET_SINGLE_SKILL",
  SET_ALL_SKILLS: "SET_ALL_SKILLS",
  SET_SELECTED_USER: "SET_SELECTED_USER",
  SET_SKILLS_MANUALLY_MODIFIED: "SET_SKILLS_MANUALLY_MODIFIED",
  LOAD_CHARACTER_SKILLS: "LOAD_CHARACTER_SKILLS",
  SET_RIG_SLOT_ERRORS: "SET_RIG_SLOT_ERRORS",
  ADD_ORE_ID_TO_BE_IGNORED: "ADD_ORE_ID_TO_BE_IGNORED",
  REMOVE_ORE_ID_TO_BE_IGNORED: "REMOVE_ORE_ID_TO_BE_IGNORED",
  CLEAR_ORE_IDS_TO_BE_IGNORED: "CLEAR_ORE_IDS_TO_BE_IGNORED",
  SET_MARKET_LOCATION: "SET_MARKET_LOCATION",
  SET_MARKET_LISTING: "SET_MARKET_LISTING",
  SET_INPUT_MODIFIED: "SET_INPUT_MODIFIED",
  SET_REQUESTED_MINERALS: "SET_REQUESTED_MINERALS",
  SET_REPROCESSING_CALCULATION_SETTINGS: "SET_REPROCESSING_CALCULATION_SETTINGS",
};

/**
 * Reducer function for managing reprocessing page state.
 * 
 * Handles state transitions based on action types, providing immutable
 * state updates for the reprocessing page component. Manages complex
 * reprocessing calculations, skill management, structure configuration,
 * market settings, and ore filtering operations.
 * 
 * @param {Object} state - Current state object
 * @param {Array} state.reprocessingObjects - Reprocessing calculation results
 * @param {Array} state.processedInput - Processed input data
 * @param {string} state.inputText - Raw input text
 * @param {boolean} state.toMinerals - Whether to output minerals or materials
 * @param {boolean} state.displayAdvancedView - Whether to show advanced view
 * @param {boolean} state.isPageLoading - Page loading state
 * @param {Object} state.currentStructure - Current reprocessing structure
 * @param {Object} state.activeSkills - Active skill levels by skill ID
 * @param {string|null} state.selectedUser - Selected user character hash
 * @param {boolean} state.skillsManuallyModified - Whether skills were manually modified
 * @param {Object} state.rigSlotErrors - Rig slot validation errors
 * @param {Array} state.oreIDsToBeIgnored - Array of ore IDs to ignore
 * @param {string} state.marketLocation - Market location for pricing
 * @param {string} state.marketListing - Market listing type (buy/sell)
 * @param {boolean} state.inputModified - Whether input has been modified
 * @param {Object} state.requestedMinerals - Requested minerals data
 * @param {Object} state.reprocessingCalculationSettings - Calculation settings
 * @param {Object} action - Action object containing type and payload
 * @param {string} action.type - Action type from REPROCESSING_ACTION_TYPES
 * @param {*} [action.payload] - Action payload data
 * @returns {Object} New state object
 * 
 * @example
 * const newState = reprocessingReducer(currentState, {
 *   type: REPROCESSING_ACTION_TYPES.SET_SINGLE_SKILL,
 *   payload: { id: 3385, level: 5 }
 * });
 */
export function reprocessingReducer(state, action) {
  switch (action.type) {
    case REPROCESSING_ACTION_TYPES.SET_REPROCESSING_OBJECTS:
      return { ...state, reprocessingObjects: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_PROCESSED_INPUT:
      return { ...state, processedInput: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_INPUT_TEXT:
      return { ...state, inputText: action.payload };
    case REPROCESSING_ACTION_TYPES.TOGGLE_TO_MINERALS:
      return { ...state, toMinerals: !state.toMinerals };
    case REPROCESSING_ACTION_TYPES.SET_PAGE_LOADING:
      return { ...state, isPageLoading: action.payload };
    case REPROCESSING_ACTION_TYPES.TOGGLE_DISPLAY_ADVANCED_VIEW:
      return { ...state, displayAdvancedView: !state.displayAdvancedView };
    case REPROCESSING_ACTION_TYPES.SET_CURRENT_STRUCTURE:
      return { ...state, currentStructure: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_SINGLE_SKILL:
      return {
        ...state,
        activeSkills: {
          ...state.activeSkills,
          [action.payload.id]: action.payload.level,
        },
        skillsManuallyModified: true,
      };
    case REPROCESSING_ACTION_TYPES.SET_ALL_SKILLS:
      return {
        ...state,
        activeSkills: action.payload,
        skillsManuallyModified: false,
      };
    case REPROCESSING_ACTION_TYPES.SET_SELECTED_USER:
      return {
        ...state,
        selectedUser: action.payload,
        skillsManuallyModified: false, // Reset when user changes
      };
    case REPROCESSING_ACTION_TYPES.SET_SKILLS_MANUALLY_MODIFIED:
      return {
        ...state,
        skillsManuallyModified: action.payload,
      };
    case REPROCESSING_ACTION_TYPES.LOAD_CHARACTER_SKILLS:
      return {
        ...state,
        activeSkills: action.payload.skills,
        skillsManuallyModified: false,
      };
    case REPROCESSING_ACTION_TYPES.SET_RIG_SLOT_ERRORS:
      return {
        ...state,
        rigSlotErrors: action.payload,
      };
    case REPROCESSING_ACTION_TYPES.ADD_ORE_ID_TO_BE_IGNORED:
      return {
        ...state,
        oreIDsToBeIgnored: [
          ...new Set([...state.oreIDsToBeIgnored, action.payload]),
        ],
      };
    case REPROCESSING_ACTION_TYPES.REMOVE_ORE_ID_TO_BE_IGNORED:
      return {
        ...state,
        oreIDsToBeIgnored: state.oreIDsToBeIgnored.filter(
          (id) => id !== action.payload
        ),
      };
    case REPROCESSING_ACTION_TYPES.CLEAR_ORE_IDS_TO_BE_IGNORED:
      return { ...state, oreIDsToBeIgnored: [] };
    case REPROCESSING_ACTION_TYPES.SET_MARKET_LOCATION:
      return { ...state, marketLocation: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_MARKET_LISTING:
      return { ...state, marketListing: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_INPUT_MODIFIED:
      return { ...state, inputModified: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_REQUESTED_MINERALS:
      return { ...state, requestedMinerals: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_REPROCESSING_CALCULATION_SETTINGS:
      return { 
        ...state, 
        reprocessingCalculationSettings: {
          ...state.reprocessingCalculationSettings,
          ...action.payload
        }
      };
    default:
      return state;
  }
}
