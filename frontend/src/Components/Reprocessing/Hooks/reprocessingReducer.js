/** The two ways the page reprocesses: what pasted items give, or the ore to buy for pasted minerals. */
export const reprocessingDirections = {
  toMinerals: "toMinerals",
  fromMinerals: "fromMinerals",
};

/**
 * The changes the Reprocessing page's reducer accepts, each a choice the reader made.
 *
 * @constant {Object<string, string>}
 */
export const REPROCESSING_ACTION_TYPES = {
  SET_DIRECTION: "SET_DIRECTION",
  SET_PASTE: "SET_PASTE",
  COMMIT_PASTE: "COMMIT_PASTE",
  CLEAR_PASTE: "CLEAR_PASTE",
  SET_SELLER: "SET_SELLER",
  SET_CURRENT_STRUCTURE: "SET_CURRENT_STRUCTURE",
  SET_SKILL_LEVEL: "SET_SKILL_LEVEL",
  SET_SELECTED_USER: "SET_SELECTED_USER",
  SET_MARKET_LOCATION: "SET_MARKET_LOCATION",
  SET_MARKET_ORDER_TYPE: "SET_MARKET_ORDER_TYPE",
  CHANGE_REPROCESSING_SETTINGS: "CHANGE_REPROCESSING_SETTINGS",
};

/**
 * Each direction's paste as it is being typed and as it was last reprocessed, both empty.
 *
 * @returns {Object<string, {text: string, committed: string}>}
 */
export function emptyPastes() {
  return Object.fromEntries(
    Object.values(reprocessingDirections).map((direction) => [
      direction,
      { text: "", committed: "" },
    ]),
  );
}

/**
 * The Reprocessing page's state after one of the reader's choices; results are never held here,
 * they are worked out from it while rendering.
 *
 * @param {Object} state
 * @param {{type: string, payload?: *}} action - a type from REPROCESSING_ACTION_TYPES
 * @returns {Object}
 */
export function reprocessingReducer(state, action) {
  switch (action.type) {
    case REPROCESSING_ACTION_TYPES.SET_DIRECTION:
      return { ...state, direction: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_PASTE:
      return {
        ...state,
        pastes: {
          ...state.pastes,
          [state.direction]: {
            ...state.pastes[state.direction],
            text: action.payload,
          },
        },
      };
    case REPROCESSING_ACTION_TYPES.COMMIT_PASTE:
      return {
        ...state,
        pastes: {
          ...state.pastes,
          [state.direction]: {
            ...state.pastes[state.direction],
            committed: state.pastes[state.direction].text,
          },
        },
      };
    case REPROCESSING_ACTION_TYPES.CLEAR_PASTE:
      return {
        ...state,
        pastes: {
          ...state.pastes,
          [state.direction]: { text: "", committed: "" },
        },
      };
    case REPROCESSING_ACTION_TYPES.SET_SELLER:
      return { ...state, sellerHash: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_CURRENT_STRUCTURE:
      return { ...state, currentStructure: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_SKILL_LEVEL: {
      const { [action.payload.id]: _dropped, ...kept } = state.skillOverrides;
      return {
        ...state,
        skillOverrides:
          action.payload.level === null
            ? kept
            : { ...kept, [action.payload.id]: action.payload.level },
      };
    }
    case REPROCESSING_ACTION_TYPES.SET_SELECTED_USER:
      return { ...state, selectedUser: action.payload, skillOverrides: {} };
    case REPROCESSING_ACTION_TYPES.SET_MARKET_LOCATION:
      return { ...state, marketLocation: action.payload };
    case REPROCESSING_ACTION_TYPES.SET_MARKET_ORDER_TYPE:
      return { ...state, orderType: action.payload };
    case REPROCESSING_ACTION_TYPES.CHANGE_REPROCESSING_SETTINGS:
      return {
        ...state,
        reprocessingSettings: action.payload(state.reprocessingSettings),
      };
    default:
      return state;
  }
}
