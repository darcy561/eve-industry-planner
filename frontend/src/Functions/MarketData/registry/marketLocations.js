import { queryClient } from "../../../queryClient";
import useUsersStore from "../../../Zustand/usersStore";
import { fetchMarketLocations } from "../../Endpoints/Private/marketLocations.js";

/** @type {string[]} */
export const MARKET_LOCATIONS_QUERY_KEY = ["market", "locations"];

/**
 * Keeps the entry for the session, nothing observing it, and is called by the
 * two writers rather than run as this module loads.
 */
function keepForTheSession() {
  queryClient.setQueryDefaults(MARKET_LOCATIONS_QUERY_KEY, {
    gcTime: Infinity,
  });
}

/**
 * The set as it stands, or the account's own markets until it has been read.
 *
 * @returns {Array<object>}
 */
export function marketsToOffer() {
  return (
    readMarketLocations() ??
    useUsersStore.getState().applicationSettings.marketLocations ??
    []
  );
}

/**
 * The set as it stands, or undefined where it has not been read — an empty list
 * would say the reader has none.
 *
 * @returns {Array<object>|undefined}
 */
export function readMarketLocations() {
  return queryClient.getQueryData(MARKET_LOCATIONS_QUERY_KEY);
}

/**
 * Holds what a sign-in already carried. A bootstrap that could not compose the
 * set omits it, and nothing is held for that.
 *
 * @param {Array<object>|undefined} composed
 * @returns {void}
 */
export function seedMarketLocations(composed) {
  if (!Array.isArray(composed)) return;
  keepForTheSession();
  queryClient.setQueryData(MARKET_LOCATIONS_QUERY_KEY, composed);
}

/** Whether a market this reader changed is still only in the store. */
let awaitingWrite = false;

/**
 * Records that a market moved, so the set is read again once the debounced save
 * carrying it reaches the server.
 *
 * @returns {void}
 */
export function marketLocationsChanged() {
  awaitingWrite = true;
}

/**
 * Reads the set again if a market changed, for a settings document just saved,
 * and stays marked where the read fails.
 *
 * @returns {Promise<void>}
 */
export async function refreshMarketLocationsAfterWrite() {
  if (!awaitingWrite) return;
  awaitingWrite = false;

  try {
    await refreshMarketLocations();
  } catch {
    awaitingWrite = true;
  }
}

/**
 * Reads the whole set again rather than folding one owner's document into it,
 * which would need the server's collapsing rule a second time.
 *
 * @returns {Promise<Array<object>>}
 */
export function refreshMarketLocations() {
  keepForTheSession();
  return queryClient.query({
    queryKey: MARKET_LOCATIONS_QUERY_KEY,
    queryFn: fetchMarketLocations,
    staleTime: 0,
    gcTime: Infinity,
  });
}
