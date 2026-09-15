import { queryClient } from "../../queryClient";
import {
  allMarketSources,
  persistsAcrossSessions,
  sourceIn,
} from "./marketSources";
import {
  requestAdjustedPrice,
  requestPrice,
  setClockMovedListener,
} from "./priceLoader";
import { readStoredPrice, writeStoredPrice } from "./priceStore";
import { clockedSources } from "./sourceClocks";

/**
 * Where a price is held, and the two halves of getting one.
 *
 * **Reading and asking are separate.** The readers below answer from what the
 * cache already holds and report absence rather than waiting, which is what
 * keeps the synchronous callers working: a shopping list row and a basis
 * comparison both read a price inside a reduce, and neither can await.
 *
 * One entry per type at one market, so a price resolved for one panel is present
 * for the next without being asked for again, and a market that fails fails
 * against that market rather than leaving a hole in one view's set.
 *
 * The client is the module-level one rather than a hook's, because most of these
 * callers are not components — a shopping list, a job, a reducer.
 */

/**
 * A held row never goes stale by age. Its market's clock decides: the row is
 * what that market would answer with until the market's book is walked again,
 * whether that is ten minutes or ten hours. Any duration here would re-ask for
 * prices that have not moved and still miss the moment they do.
 */
const PRICE_STALE_TIME = Infinity;

/**
 * Every market key is built from one of these, so that dropping a whole market's
 * rows and reading one of them cannot disagree about where they are held.
 *
 * @param {string} sourceID
 */
export const marketPricesKey = (sourceID) => [
  "market",
  "price",
  String(sourceID),
];

/** @type {string[]} */
export const ADJUSTED_PRICES_KEY = ["market", "adjusted"];

/**
 * What a surface waiting on a set of prices is keyed under.
 *
 * It sits here beside the rows it stands over because both this module and the
 * hook that builds the full key need it, and the hook already reads this one.
 */
export const MARKET_PRICES_QUERY_KEY = ["market", "prices"];

/** @param {number|string} typeID @param {string} sourceID */
export const priceQueryKey = (typeID, sourceID) => [
  ...marketPricesKey(sourceID),
  String(typeID),
];

/** @param {number|string} typeID */
export const adjustedQueryKey = (typeID) => [
  ...ADJUSTED_PRICES_KEY,
  String(typeID),
];

/**
 * One type's row at one market, or undefined where the cache holds none.
 *
 * Undefined covers both "not asked for yet" and "asked and the market holds no
 * order": a caller reading a price cannot act differently on the two, and the
 * one that can — the loader deciding whether to ask again — reads the query's
 * own state rather than this.
 *
 * @param {number|string} typeID
 * @param {string} sourceID
 * @returns {{buy: number, sell: number, buyP95: number, sellP05: number,
 *   refreshedAt: number}|undefined}
 */
export function readPrice(typeID, sourceID) {
  return queryClient.getQueryData(priceQueryKey(typeID, sourceID)) ?? undefined;
}

/**
 * One type's adjusted price, or undefined where the cache holds none.
 *
 * @param {number|string} typeID
 * @returns {number|undefined}
 */
export function readAdjustedPrice(typeID) {
  return queryClient.getQueryData(adjustedQueryKey(typeID)) ?? undefined;
}

/**
 * Asks for each type at the market it is priced against, and resolves once every
 * want has settled.
 *
 * **Wants are pairs, not a cross product.** A job prices most materials against
 * one market and some against another, and asking for every type at every market
 * would fetch what nothing reads — which is the cost this whole stage exists to
 * remove. The caller works out the pairs; `pricesWantedBy` does it for a job.
 *
 * The wants of one tick reach the loader together and leave as a single request;
 * a want the cache already holds and considers fresh is not asked about at all.
 * A market holding no order settles as null, which is an answer — only a request
 * that could not be made is an error, and that is not written to the cache.
 *
 * @param {object} params
 * @param {Iterable<{typeID: number|string, sourceID: string}>} params.wants
 * @param {Iterable<number|string>} [params.adjustedTypeIDs] - Types whose
 *   adjusted price is also wanted. Source-independent, so named apart
 * @returns {Promise<{asked: number, failed: number}>} How many wants were put to
 *   the loader and how many could not be answered, so a caller can tell one
 *   unreachable market from nothing having worked at all
 */
export async function fetchPrices({ wants, adjustedTypeIDs = [] }) {
  const asked = [];
  const seen = new Set();

  for (const { typeID, sourceID } of wants ?? []) {
    if (typeID == null || !sourceID) continue;
    const key = `${sourceID}|${typeID}`;
    if (seen.has(key)) continue;
    seen.add(key);

    asked.push(
      queryClient.ensureQueryData({
        queryKey: priceQueryKey(typeID, sourceID),
        queryFn: () => resolvePrice(typeID, sourceID),
        staleTime: PRICE_STALE_TIME,
        retry: false,
      }),
    );
  }

  for (const typeID of new Set(Array.from(adjustedTypeIDs, String))) {
    asked.push(
      queryClient.ensureQueryData({
        queryKey: adjustedQueryKey(typeID),
        queryFn: () => requestAdjustedPrice(typeID),
        staleTime: PRICE_STALE_TIME,
        retry: false,
      }),
    );
  }

  // A market that could not be reached leaves its own entries unwritten and must
  // not stop the rest: the view draws what resolved rather than nothing. The
  // count is what lets a caller tell that apart from every want failing, which
  // is a fetch that did not happen rather than a set of empty markets.
  const settled = await Promise.allSettled(asked);

  return {
    asked: settled.length,
    failed: settled.filter((result) => result.status === "rejected").length,
  };
}

/**
 * One row, from whichever tier can answer for it.
 *
 * **This is the only seam the persistent tier enters at.** Everything above —
 * the accessor, the wrapper query, the clock machinery — asks for a price and
 * learns nothing about where it came from, which is what lets a reader-saved
 * market behave exactly like a hub everywhere else.
 *
 * A session-tier source goes straight to the loader. A persistent one is read
 * from disk first, because it was fetched at the reader's own expense: a miss
 * falls through to the network and what comes back is written to both.
 */
async function resolvePrice(typeID, sourceID) {
  const source = sourceIn(allMarketSources(), sourceID);

  if (!persistsAcrossSessions(source?.kind)) {
    return requestPrice(typeID, sourceID);
  }

  const stored = await readStoredPrice(sourceID, typeID);
  if (stored) return stored;

  const row = await requestPrice(typeID, sourceID);

  // Not awaited: the price is already in hand, and keeping it for next time is
  // bookkeeping this reader is not waiting on. Awaiting would let a slow or
  // wedged store delay a figure that has already arrived.
  //
  // A market holding no order for a type resolves as null, and that is not
  // worth keeping: it is the cheapest thing to learn again, and storing it
  // would hold a reader at "nothing here" for as long as the row survived.
  if (row) void writeStoredPrice(sourceID, typeID, row);

  return row;
}

/**
 * Drops every row held for a market whose book has been walked again.
 *
 * The whole market at once, because the whole book was walked at once: a market
 * that answers one type with a newer figure has newer figures for all of them,
 * and leaving the rest would show a reader two moments side by side.
 *
 * **Removed, not invalidated.** These rows are superseded rather than merely
 * old, and the difference is not cosmetic: entries here never go stale by age,
 * so a reader asking through `ensureQueryData` is handed an invalidated entry
 * as readily as a fresh one and the new figures are never fetched. Removing
 * them is what makes the next reader ask.
 */
setClockMovedListener(({ sources, adjusted }) => {
  for (const sourceID of sources) {
    queryClient.removeQueries({ queryKey: marketPricesKey(sourceID) });
  }

  if (adjusted) {
    queryClient.removeQueries({ queryKey: ADJUSTED_PRICES_KEY });
  }

  // Dropping the rows is not enough to reach anyone looking at them. A priced
  // surface reads its figures synchronously while rendering and subscribes to
  // none of these entries — the only thing it subscribes to is the query that
  // holds it up, keyed by the wants it asked for. So the rows are dropped and
  // that query is asked again: without this a reader watching a panel keeps the
  // superseded figures until something unrelated happens to re-render them.
  queryClient.invalidateQueries({ queryKey: MARKET_PRICES_QUERY_KEY });
});

/**
 * Asks each market holding rows for one type it already holds, so that market
 * reports its clock.
 *
 * This is the whole of how a moved book is noticed. Nothing polls for a clock,
 * because no request exists whose purpose is to report one — a price answer
 * carries its market's clock, so asking for a single price a market has already
 * answered costs one row and settles whether every other row held for it is
 * still good. A market whose clock has not moved is left entirely alone.
 *
 * @returns {Promise<void>}
 */
export async function revalidateSourceClocks() {
  const wants = [];

  for (const sourceID of clockedSources()) {
    const typeID = anyHeldTypeAt(sourceID);
    if (typeID !== undefined) wants.push({ typeID, sourceID });
  }

  if (wants.length === 0) return;

  await Promise.allSettled(
    wants.map(({ typeID, sourceID }) => requestPrice(typeID, sourceID)),
  );
}

/**
 * One type this market has an entry for, whichever comes first.
 *
 * Any held type answers the clock as well as any other, so there is nothing to
 * choose between them and no reason for a sentinel type id that would be a
 * magic constant in the bargain.
 */
function anyHeldTypeAt(sourceID) {
  const [entry] = queryClient.getQueryCache().findAll({
    queryKey: marketPricesKey(sourceID),
  });

  return entry?.queryKey?.[3];
}
