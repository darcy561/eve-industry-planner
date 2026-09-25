import { queryClient } from "../../../queryClient";
import useUsersStore from "../../../Zustand/usersStore";
import { fetchMarketLocations } from "../../Endpoints/Private/marketLocations.js";

/**
 * The markets a reader may price against, held where a synchronous reader can
 * reach them.
 *
 * **The server composes this, not the browser.** It is the account's own markets
 * plus the ones each organisation the account belongs to has shared, collapsed
 * so that one place is one market. Composing it here as well would be the same
 * rule in a second language, free to disagree with the first.
 *
 * Held in the query cache rather than the settings store, and that is
 * load-bearing: `applicationSettings` is the document the SPA sends back on
 * save, so a union sitting beside it would eventually be written into the
 * account's own lane and copy another owner's markets into it permanently.
 */

/** @type {string[]} */
export const MARKET_LOCATIONS_QUERY_KEY = ["market", "locations"];

/**
 * Keeps the entry for the session, before anything is put in it.
 *
 * Nothing observes it — it is read synchronously, the way a price row is — so
 * the cache counts it unobserved from the moment it lands and would collect it
 * on the default five minutes. A reader would then fall back to their own
 * account's markets and quietly lose every market their organisation shares,
 * with nothing said and nothing to re-read it until some owner's settings
 * happened to change.
 *
 * Called by the two writers rather than run as this module loads. A side effect
 * at load reaches every importer, however distantly, and asks each of them for a
 * query client complete enough to take it — which is how a page that stubs the
 * client for its own tests came to fail on a market module it never names.
 */
function keepForTheSession() {
  queryClient.setQueryDefaults(MARKET_LOCATIONS_QUERY_KEY, {
    gcTime: Infinity,
  });
}

/**
 * The set as it stands, or the account's own markets until it has been read.
 *
 * One place asks the question, so no caller has to remember which of the two it
 * is looking at.
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
 * The set as it stands, or undefined where it has not been read.
 *
 * Undefined rather than an empty list: a caller falls back to the account's own
 * markets until the composed set arrives, and an empty list would tell it the
 * reader has none.
 *
 * @returns {Array<object>|undefined}
 */
export function readMarketLocations() {
  return queryClient.getQueryData(MARKET_LOCATIONS_QUERY_KEY);
}

/**
 * Holds what a sign-in already carried, so a first load does not ask again for
 * something the bootstrap answered.
 *
 * A bootstrap that could not compose the set omits it, which is not the same as
 * an account having none — nothing is held for that, and the next read asks.
 *
 * @param {Array<object>|undefined} composed
 * @returns {void}
 */
export function seedMarketLocations(composed) {
  if (!Array.isArray(composed)) return;
  keepForTheSession();
  queryClient.setQueryData(MARKET_LOCATIONS_QUERY_KEY, composed);
}

/**
 * Whether a market this reader changed is still only in the store.
 *
 * The composed set is the server's answer, so a market saved here is absent
 * from it until the document it was saved to has been written and the set read
 * again. `marketsToOffer` answers the composed set wherever there is one, so
 * until that happens the reader's own new market is offered nowhere at all.
 */
let awaitingWrite = false;

/**
 * Records that a market moved, so the set is read again once the document
 * carrying it reaches the server.
 *
 * Marked rather than read now: the save is debounced, and reading before it
 * lands would fetch the set as it was before the change and hold that instead.
 *
 * @returns {void}
 */
export function marketLocationsChanged() {
  awaitingWrite = true;
}

/**
 * Reads the set again if a market changed, for a settings document that has
 * just been saved.
 *
 * Left marked when the read fails, so the next save picks it up rather than the
 * reader being left with a set that silently no longer includes what they
 * saved.
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
 * Reads the set again.
 *
 * For a websocket update saying some owner's settings moved: the update carries
 * one owner's document, and folding that into the union here would need the
 * collapsing rule a second time. Asking again costs one request on a rare edit
 * and keeps the rule in one place.
 *
 * @returns {Promise<Array<object>>}
 */
export function refreshMarketLocations() {
  keepForTheSession();
  return queryClient.fetchQuery({
    queryKey: MARKET_LOCATIONS_QUERY_KEY,
    queryFn: fetchMarketLocations,
    staleTime: 0,
    gcTime: Infinity,
  });
}
