/**
 * Price Entry Reducer Hook for EVE Industry Planner.
 *
 * Custom React hook that provides state management for the price entry dialogue component.
 * Uses useReducer with a custom reducer to handle state transitions for price entry
 * building, market/order display settings, and dialogue visibility.
 */

import { useReducer, useMemo } from "react";
import {
  PRICING_SIDE,
  resolvePricingSide,
} from "../../../../Functions/MarketData/defaults/pricingSide";
import {
  PRICE_ENTRY_ACTION_TYPES,
  priceEntryReducer,
} from "./priceEntryReducer";
import useUsersStore from "../../../../Zustand/usersStore";
import { buildSetIsLoadingActionPayload } from "../../../../Functions/Helper/setIsLoadingAction";
import GLOBAL_CONFIG from "../../../../global-config-app";
import { useAdvanceWhenFollowingAppDefault } from "../../../../Hooks/Planner/useAdvanceWhenFollowingAppDefault.js";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_TYPE } = GLOBAL_CONFIG;

/**
 * What the dialogue opens on: the account's buying default, read fresh rather
 * than closed over, because the reducer rebuilds its initial state on reset.
 *
 * @returns {{marketLocation: string, orderType: string}}
 */
function resolveBuyingDefault() {
  return resolvePricingSide({
    accountPricing: useUsersStore.getState().applicationSettings.defaultPricing,
    side: PRICING_SIDE.BUYING,
  });
}

/**
 * Custom hook for managing price entry dialogue state.
 */
export default function usePriceEntryReducer() {
  const { marketLocation: defaultMarketLocation, orderType: defaultOrderType } =
    resolvePricingSide({
      accountPricing: useUsersStore(
        (s) => s.applicationSettings.defaultPricing,
      ),
      side: PRICING_SIDE.BUYING,
    });

  /**
   * Creates the initial state for the price entry dialogue.
   */
  const createInitialState = () => ({
    isOpen: false,
    isLoading: false,
    requestedJobIDs: [],
    priceEntryList: [],
    ...resolveBuyingDefault(),
  });

  const initialState = createInitialState();

  const [state, dispatch] = useReducer(
    (state, action) => priceEntryReducer(state, action, createInitialState),
    initialState,
  );

  useAdvanceWhenFollowingAppDefault({
    applicationDefault: defaultMarketLocation,
    committedValue: state.marketLocation,
    fallback: DEFAULT_MARKET_OPTION,
    dispatch,
    advanceActionType: PRICE_ENTRY_ACTION_TYPES.SET_MARKET_LOCATION,
  });

  useAdvanceWhenFollowingAppDefault({
    applicationDefault: defaultOrderType,
    committedValue: state.orderType,
    fallback: DEFAULT_ORDER_TYPE,
    dispatch,
    advanceActionType: PRICE_ENTRY_ACTION_TYPES.SET_LISTING_TYPE,
  });

  /**
   * Action dispatchers for the price entry dialogue state.
   */
  const actions = useMemo(
    () => ({
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
        dispatch({
          type: PRICE_ENTRY_ACTION_TYPES.SET_REQUESTED_JOB_IDS,
          payload: jobIDs,
        });
      },
      setPriceEntryList: (list) => {
        dispatch({
          type: PRICE_ENTRY_ACTION_TYPES.SET_PRICE_ENTRY_LIST,
          payload: list,
        });
      },
      setMarketLocation: (market) => {
        dispatch({
          type: PRICE_ENTRY_ACTION_TYPES.SET_MARKET_LOCATION,
          payload: market,
        });
      },
      setOrderType: (order) => {
        dispatch({
          type: PRICE_ENTRY_ACTION_TYPES.SET_LISTING_TYPE,
          payload: order,
        });
      },
      resetState: () => {
        dispatch({ type: PRICE_ENTRY_ACTION_TYPES.RESET_STATE });
      },
    }),
    [],
  );

  return { state, actions };
}
