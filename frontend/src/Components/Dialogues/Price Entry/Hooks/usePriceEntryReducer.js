/**
 * Price Entry Reducer Hook for EVE Industry Planner.
 * 
 * Custom React hook that provides state management for the price entry dialog component.
 * Uses useReducer with a custom reducer to handle state transitions for price entry
 * building, market/order display settings, and dialog visibility.
 */

import { useReducer, useMemo } from "react";
import { PRICE_ENTRY_ACTION_TYPES, priceEntryReducer } from "./priceEntryReducer";
import useUsersStore from "../../../../Zustand/usersStore";
import { buildSetIsLoadingActionPayload } from "../../../../Functions/Helper/setIsLoadingAction";
import GLOBAL_CONFIG from "../../../../global-config-app";
import { useAdvanceWhenFollowingAppDefault } from "../../../../Hooks/Planner/useAdvanceWhenFollowingAppDefault.js";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_OPTION } = GLOBAL_CONFIG;

/**
 * Custom hook for managing price entry dialog state.
 */
export default function usePriceEntryReducer() {
    const defaultMarketLocation = useUsersStore(
        (s) => s.applicationSettings.defaultMarketLocation
    );
    const defaultOrderType = useUsersStore(
        (s) => s.applicationSettings.defaultOrderType
    );

    /**
     * Creates the initial state for the price entry dialog.
     */
    const createInitialState = () => ({
        isOpen: false,
        isLoading: false,
        requestedJobIDs: [],
        priceEntryList: [],
        displayMarket:
          useUsersStore.getState().applicationSettings.defaultMarketLocation ??
          DEFAULT_MARKET_OPTION,
        displayOrder:
          useUsersStore.getState().applicationSettings.defaultOrderType ??
          DEFAULT_ORDER_OPTION,
        clearUnconfirmedTrigger: 0,
    });

    const initialState = createInitialState();

    const [state, dispatch] = useReducer(
        (state, action) => priceEntryReducer(state, action, createInitialState),
        initialState
    );

    useAdvanceWhenFollowingAppDefault({
        applicationDefault: defaultMarketLocation,
        committedValue: state.displayMarket,
        fallback: DEFAULT_MARKET_OPTION,
        dispatch,
        advanceActionType: PRICE_ENTRY_ACTION_TYPES.SET_DISPLAY_MARKET,
    });

    useAdvanceWhenFollowingAppDefault({
        applicationDefault: defaultOrderType,
        committedValue: state.displayOrder,
        fallback: DEFAULT_ORDER_OPTION,
        dispatch,
        advanceActionType: PRICE_ENTRY_ACTION_TYPES.SET_DISPLAY_ORDER,
    });

    /**
     * Action dispatchers for the price entry dialog state.
     */
    const actions = useMemo(() => ({
        toggleIsOpen: () => {
            dispatch({ type: PRICE_ENTRY_ACTION_TYPES.TOGGLE_IS_OPEN });
        },
        /**
         * @param {boolean} value
         * @param {string} [loadingMessage] - Optional caption while loading
         */
        setIsLoading: (value, loadingMessage) => {
            dispatch({
                type: PRICE_ENTRY_ACTION_TYPES.SET_IS_LOADING,
                payload: buildSetIsLoadingActionPayload(value, loadingMessage),
            });
        },
        setRequestedJobIDs: (jobIDs) => {
            dispatch({ type: PRICE_ENTRY_ACTION_TYPES.SET_REQUESTED_JOB_IDS, payload: jobIDs });
        },
        setPriceEntryList: (list) => {
            dispatch({ type: PRICE_ENTRY_ACTION_TYPES.SET_PRICE_ENTRY_LIST, payload: list });
        },
        setDisplayMarket: (market) => {
            dispatch({ type: PRICE_ENTRY_ACTION_TYPES.SET_DISPLAY_MARKET, payload: market });
        },
        setDisplayOrder: (order) => {
            dispatch({ type: PRICE_ENTRY_ACTION_TYPES.SET_DISPLAY_ORDER, payload: order });
        },
        setClearUnconfirmedTrigger: (value) => {
            dispatch({ type: PRICE_ENTRY_ACTION_TYPES.SET_CLEAR_UNCONFIRMED_TRIGGER, payload: value });
        },
        resetState: () => {
            dispatch({ type: PRICE_ENTRY_ACTION_TYPES.RESET_STATE });
        },
    }), []);

    return { state, actions };
}

