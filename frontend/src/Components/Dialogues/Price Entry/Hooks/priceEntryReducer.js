/**
 * Price Entry Reducer for EVE Industry Planner.
 * 
 * Manages state transitions for the price entry dialogue component, handling actions
 * for dialogue visibility, price entry list building, and market/order display settings.
 * 
 * @fileoverview Reducer for price entry dialogue state management
 */

import { normalizeSetIsLoadingPayload } from "../../../../Functions/Helper/setIsLoadingAction";

/**
 * Action types for the price entry reducer.
 */
export const PRICE_ENTRY_ACTION_TYPES = {
    TOGGLE_IS_OPEN: "TOGGLE_IS_OPEN",
    SET_IS_LOADING: "SET_IS_LOADING",
    SET_REQUESTED_JOB_IDS: "SET_REQUESTED_JOB_IDS",
    SET_PRICE_ENTRY_LIST: "SET_PRICE_ENTRY_LIST",
    SET_DISPLAY_MARKET: "SET_DISPLAY_MARKET",
    SET_DISPLAY_ORDER: "SET_DISPLAY_ORDER",
    SET_CLEAR_UNCONFIRMED_TRIGGER: "SET_CLEAR_UNCONFIRMED_TRIGGER",
    RESET_STATE: "RESET_STATE",
};

/**
 * Reducer function for managing price entry dialogue state.
 */
export function priceEntryReducer(state, action, createInitialState) {
    switch (action.type) {
        case PRICE_ENTRY_ACTION_TYPES.TOGGLE_IS_OPEN:
            return { ...state, isOpen: !state.isOpen };
        case PRICE_ENTRY_ACTION_TYPES.SET_IS_LOADING: {
            const { isLoading, loadingMessage } = normalizeSetIsLoadingPayload(
                action.payload,
            );
            return {
                ...state,
                isLoading,
                loadingMessage: isLoading ? loadingMessage : undefined,
            };
        }
        case PRICE_ENTRY_ACTION_TYPES.SET_REQUESTED_JOB_IDS:
            return { ...state, requestedJobIDs: action.payload };
        case PRICE_ENTRY_ACTION_TYPES.SET_PRICE_ENTRY_LIST:
            return { ...state, priceEntryList: action.payload };
        case PRICE_ENTRY_ACTION_TYPES.SET_DISPLAY_MARKET:
            return { ...state, displayMarket: action.payload };
        case PRICE_ENTRY_ACTION_TYPES.SET_DISPLAY_ORDER:
            return { ...state, displayOrder: action.payload };
        case PRICE_ENTRY_ACTION_TYPES.SET_CLEAR_UNCONFIRMED_TRIGGER:
            return { ...state, clearUnconfirmedTrigger: action.payload };
        case PRICE_ENTRY_ACTION_TYPES.RESET_STATE:
            return createInitialState();
        default:
            return state;
    }
}

