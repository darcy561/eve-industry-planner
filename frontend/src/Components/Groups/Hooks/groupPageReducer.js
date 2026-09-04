/**
 * Group Page Reducer for EVE Industry Planner.
 */

/**
 * Action types for the group page reducer.
 *
 * @constant {Object} GROUP_PAGE_ACTION_TYPES
 * @property {string} SET_RIGHT_DRAWER_CONTENT_ID - Set the content ID for the right drawer
 * @property {string} SET_EXPAND_RIGHT_DRAWER - Set whether the right drawer should be expanded
 * @property {string} SET_SKELETON_ELEMENTS_TO_DISPLAY - Set number of skeleton elements to show
 * @property {string} SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN - Set if page requires drawer to be open
 * @property {string} SET_HIGHLIGHTED_ITEMS - Set highlighted items collection
 */
export const GROUP_PAGE_ACTION_TYPES = {
    SET_RIGHT_DRAWER_CONTENT_ID: "SET_RIGHT_DRAWER_CONTENT_ID",
    SET_EXPAND_RIGHT_DRAWER: "SET_EXPAND_RIGHT_DRAWER",
    SET_SKELETON_ELEMENTS_TO_DISPLAY: "SET_SKELETON_ELEMENTS_TO_DISPLAY",
    SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN: "SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN",
    SET_HIGHLIGHTED_ITEMS: "SET_HIGHLIGHTED_ITEMS",
    SET_PAGE_VIEW: "SET_PAGE_VIEW",
}

/**
 * Reducer function for managing group page state.
 *
 * @param {Object} state - Current state object
 * @param {string|null} state.rightDrawerContentID - Content ID for the right drawer
 * @param {boolean} state.expandRightDrawer - Whether the right drawer should be expanded
 * @param {number} state.skeletonElementsToDisplay - Number of skeleton elements to show
 * @param {boolean} state.pageRequiresDrawerToBeOpen - Whether page requires drawer to be open
 * @param {Set} state.highlightedItems - Set of highlighted item IDs
 * @param {Object} action - Action object containing type and payload
 * @param {string} action.type - Action type from GROUP_PAGE_ACTION_TYPES
 * @param {*} [action.payload] - Action payload data
 * @returns {Object} New state object
 */
export function groupPageReducer(state, action) {
    switch (action.type) {
        case GROUP_PAGE_ACTION_TYPES.SET_RIGHT_DRAWER_CONTENT_ID:
            return { ...state, rightDrawerContentID: action.payload };
        case GROUP_PAGE_ACTION_TYPES.SET_EXPAND_RIGHT_DRAWER:
            return { ...state, expandRightDrawer: action.payload };
        case GROUP_PAGE_ACTION_TYPES.SET_SKELETON_ELEMENTS_TO_DISPLAY:
            return { ...state, skeletonElementsToDisplay: action.payload };
        case GROUP_PAGE_ACTION_TYPES.SET_PAGE_REQUIRES_DRAWER_TO_BE_OPEN:
            return { ...state, pageRequiresDrawerToBeOpen: action.payload };
        case GROUP_PAGE_ACTION_TYPES.SET_HIGHLIGHTED_ITEMS:
            return { ...state, highlightedItems: action.payload };
        case GROUP_PAGE_ACTION_TYPES.SET_PAGE_VIEW:
            return { ...state, pageView: action.payload };
        default:
            return state;
    }
}      

