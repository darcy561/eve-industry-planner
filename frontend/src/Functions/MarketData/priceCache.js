import { queryClient } from "../../queryClient";
import { requestAdjustedPrice, requestPrice } from "./priceLoader";

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

/** A cached row is good for this long before the next reader re-asks. */
const PRICE_STALE_TIME = 5 * 60 * 1000;

/** @param {number|string} typeID @param {string} sourceID */
export const priceQueryKey = (typeID, sourceID) => [
  "market",
  "price",
  String(sourceID),
  String(typeID),
];

/** @param {number|string} typeID */
export const adjustedQueryKey = (typeID) => [
  "market",
  "adjusted",
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
 * @returns {Promise<void>}
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
        queryFn: () => requestPrice(typeID, sourceID),
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
  // not stop the rest: the view draws what resolved rather than nothing.
  await Promise.allSettled(asked);
}
