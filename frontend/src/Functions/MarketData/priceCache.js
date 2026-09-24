import { queryClient } from "../../queryClient";
import {
  allMarketSources,
  answersAPerTypeProbe,
  isReadByTheReader,
  persistsAcrossSessions,
  sourceIn,
  wantKey,
} from "./marketSources";
import {
  requestAdjustedPrice,
  requestMarketRead,
  requestPrice,
  setClockMovedListener,
  setOrdersStoredListener,
} from "./priceLoader";
import {
  deferMarket,
  readMarketFreshness,
  readStoredPrice,
} from "./priceStore";
import { PRICE_ROTATION_MS } from "./citadelPrices";
import { readSourceClock, recordSourceClock } from "./sourceClocks";
import { outcomeOfFailedRead, readerCanAct } from "./marketReadOutcome";
import { CITADEL_ORDERS_QUERY_KEY } from "./ordersAtCitadels";

/**
 * Where a price is held, and the two halves of getting one.
 *
 * **Reading and asking are separate.** The readers below answer from what is
 * held and report absence rather than waiting — a shopping list row and an order type
 * comparison both read a price inside a reduce, and neither can await.
 *
 * One entry per type at one market, so a market that fails fails against itself
 * rather than leaving a hole in one view's set. The client is the module-level
 * one because most callers here are not components.
 */

/**
 * A held row never goes stale by age — its market's clock decides. Any duration
 * here would re-ask for prices that have not moved and still miss the moment
 * they do.
 *
 * @type {number}
 */
const PRICE_STALE_TIME = Infinity;

/**
 * How long a row with nothing watching it is kept.
 *
 * Nothing subscribes to a row — surfaces read them synchronously — so every
 * entry is unobserved the moment it lands and this is in effect how long one
 * lives. Long enough that a reader moving between screens finds the prices
 * still there, short enough that a tab left open does not hold a market's whole
 * set for the day.
 *
 * @type {number}
 */
const PRICE_CACHE_TIME = 30 * 60 * 1000;

/**
 * Every market key is built from this, so dropping a whole market's rows and
 * reading one of them cannot disagree about where they are held.
 *
 * @param {string} sourceID
 * @returns {string[]}
 */
const marketPricesKey = (sourceID) => ["market", "price", String(sourceID)];

/** @type {string[]} */
const ADJUSTED_PRICES_QUERY_KEY = ["market", "adjusted"];

/**
 * What a surface waiting on a set of prices is keyed under. Here beside the rows
 * it stands over, because this module and the hook that builds the full key both
 * need it.
 *
 * @type {string[]}
 */
export const MARKET_PRICES_QUERY_KEY = ["market", "prices"];

/** @param {number|string} typeID @param {string} sourceID */
export const priceQueryKey = (typeID, sourceID) => [
  ...marketPricesKey(sourceID),
  String(typeID),
];

/** @param {number|string} typeID */
export const adjustedQueryKey = (typeID) => [
  ...ADJUSTED_PRICES_QUERY_KEY,
  String(typeID),
];

/**
 * One type's row at one market, or undefined where the cache holds none —
 * covering both "not asked for yet" and "the market holds no order", which a
 * caller reading a price cannot act differently on.
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
    const key = wantKey(sourceID, typeID);
    if (seen.has(key)) continue;
    seen.add(key);

    asked.push(
      queryClient.ensureQueryData({
        queryKey: priceQueryKey(typeID, sourceID),
        queryFn: () => resolvePrice(typeID, sourceID),
        staleTime: PRICE_STALE_TIME,
        gcTime: PRICE_CACHE_TIME,
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
        gcTime: PRICE_CACHE_TIME,
        retry: false,
      }),
    );
  }

  // A market that could not be reached must not stop the rest: the view draws
  // what resolved rather than nothing.
  const settled = await Promise.allSettled(asked);

  return {
    asked: settled.length,
    failed: settled.filter((result) => result.status === "rejected").length,
  };
}

/**
 * One row, from whichever tier can answer for it.
 *
 * **The only seam the persistent tier enters at.** Everything above asks for a
 * price and learns nothing about where it came from, which is what lets a market
 * the reader reads themselves behave like a hub everywhere else.
 *
 * What is kept is written by the read that fetched it rather than here: that
 * read takes a whole market at once, and one resolved row shows neither what
 * every type is worth nor which have stopped trading.
 */
async function resolvePrice(typeID, sourceID) {
  const source = sourceIn(allMarketSources(), sourceID);

  if (!persistsAcrossSessions(source?.kind)) {
    return requestPrice(typeID, sourceID);
  }

  const stored = await readStoredPrice(sourceID, typeID);
  if (stored) {
    // A reload leaves rows on disk and no clock, and a market with no clock
    // cannot be seen to move: the next read would count as its first.
    recordSourceClock(sourceID, stored.refreshedAt);
    return stored;
  }

  return requestPrice(typeID, sourceID);
}

/**
 * Drops every row held for a market that has been walked again — the whole
 * market at once, because the whole of it was walked at once, and leaving the
 * rest would show a reader two moments side by side.
 *
 * **Removed, not invalidated.** Entries here never go stale by age, so
 * `ensureQueryData` hands back an invalidated one as readily as a fresh one and
 * the new figures are never fetched.
 */
setClockMovedListener(({ sources, adjusted }) => {
  for (const sourceID of sources) {
    queryClient.removeQueries({ queryKey: marketPricesKey(sourceID) });
  }

  if (adjusted) {
    queryClient.removeQueries({ queryKey: ADJUSTED_PRICES_QUERY_KEY });
  }

  // Dropping rows reaches nobody on its own: a priced surface subscribes to no
  // row entry, only to the query it waits on.
  queryClient.invalidateQueries({ queryKey: MARKET_PRICES_QUERY_KEY });
});

/**
 * Tells a surface browsing a market's orders that they have been replaced.
 *
 * A browsing surface waits on nobody — the orders it draws come from the device
 * rather than from a request it made — so without this it holds whatever was
 * stored when it opened, including nothing at all for a market that had not
 * been walked yet.
 */
setOrdersStoredListener(() => {
  queryClient.invalidateQueries({ queryKey: CITADEL_ORDERS_QUERY_KEY });
});

/**
 * Reads again, before anybody asks, every market the reader reads themselves
 * whose turn has come round.
 *
 * **This is what stops a reader paying for a whole market read on the render
 * that needs one price.** A citadel's orders only come whole, so the wait a
 * hub's next reader pays — one row — is the whole market here.
 *
 * **Due-ness is read from the device, not from memory.** The cache lets an
 * unwatched row go long before the market is due, so a rotation paced by what
 * is in it would stop rotating the moment a reader looked away — precisely when
 * reading ahead is worth anything.
 *
 * **Every market the reader saved is on it**, not only the ones they have
 * priced against, so one nothing has read yet is due now. Refreshing only what
 * has been asked for would leave prices fresh exactly where a reader has been.
 *
 * @param {number} [now]
 * @returns {Promise<number>} How many markets were read again
 */
export async function rotateSelfReadMarkets(now = Date.now()) {
  const due = await Promise.all(
    allMarketSources()
      .filter((source) => isReadByTheReader(source.kind))
      .map(async (source) => {
        const freshness = await readMarketFreshness(source.id);
        return isDue(freshness, now) ? source.id : undefined;
      }),
  );

  const rotating = due.filter(Boolean);
  if (rotating.length === 0) return 0;

  const refused = await readEach(rotating);

  await Promise.all(
    refused.map(({ sourceID, outcome }) =>
      deferMarket(sourceID, now + PRICE_ROTATION_MS, outcome),
    ),
  );

  return rotating.length;
}

/**
 * Reads each market, and says which of them settled on something the reader
 * would want to know about.
 *
 * All of them at once: a structure's market is on an ESI allowance of its own
 * rather than the one a region's orders draw on, so reading several does not
 * take anything from the prices this server serves.
 *
 * **Only an answer about the market is reported back**, not every failure. Being
 * refused, or having nobody to ask with, is an answer and is worth waiting out;
 * a read that failed says nothing — ESI may be down, or the account's characters
 * may not all have arrived yet, as they have not when a cloud account signs in
 * and its roster is still filling. Putting a market's turn back for an hour on
 * the strength of that would leave a readable market unread on nothing more than
 * bad timing.
 *
 * @param {string[]} sourceIDs
 * @returns {Promise<Array<{sourceID: string, outcome: string}>>}
 */
async function readEach(sourceIDs) {
  const settled = [];

  await Promise.all(
    sourceIDs.map(async (sourceID) => {
      try {
        await requestMarketRead(sourceID);
      } catch (error) {
        const outcome = outcomeOfFailedRead(error);
        if (readerCanAct(outcome)) settled.push({ sourceID, outcome });
      }
    }),
  );

  return settled;
}

function isDue(freshness, now) {
  // Nothing on record is a market never read, which is due now rather than
  // never: its turn cannot have passed if it has never had one.
  return !freshness || !(freshness.expiresAt > now);
}

/**
 * Asks each market holding rows for one type it already holds, so that market
 * reports its clock — the whole of how a moved clock is noticed, since a price
 * answer carries one and nothing polls for it.
 *
 * **Every market this server prices is asked, not only those that have reported
 * a clock.** A market just registered has none until its first walk, and its
 * rows read as nothing held — asking only the clocked ones would leave a reader
 * on "no price here" for as long as the tab stayed open.
 *
 * **A market the reader reads themselves is not asked**: its orders only come
 * whole, so there is no cheap question. Its turn on the rotation is what
 * replaces its rows.
 *
 * @returns {Promise<void>}
 */
export async function revalidateSourceClocks() {
  const sources = allMarketSources();
  const wants = [];

  for (const sourceID of sourcesHoldingRows()) {
    // Asking one of these for one type reads its whole market, so the question
    // that is cheap everywhere else is a walk here.
    if (!answersAPerTypeProbe(sourceIn(sources, sourceID)?.kind)) continue;

    const typeID = anyHeldTypeAt(sourceID);
    if (typeID === undefined) continue;
    wants.push({
      typeID,
      sourceID,
      unwalked: readSourceClock(sourceID) === undefined,
    });
  }

  if (wants.length === 0) return;

  await Promise.allSettled(
    wants.map(({ typeID, sourceID }) => requestPrice(typeID, sourceID)),
  );

  // A first clock is not a move, so nothing announced it — but the rows held
  // were answered before the market had been walked and all say it holds no
  // price, and a reader who asked too early would sit on that for the tab's life.
  const walkedAtLast = wants.filter(
    ({ sourceID, unwalked }) =>
      unwalked && readSourceClock(sourceID) !== undefined,
  );
  if (walkedAtLast.length === 0) return;

  for (const { sourceID } of walkedAtLast) {
    queryClient.removeQueries({ queryKey: marketPricesKey(sourceID) });
  }
  queryClient.invalidateQueries({ queryKey: MARKET_PRICES_QUERY_KEY });
}

/**
 * Every market the cache holds a row for.
 *
 * Read from the rows rather than from the clocks, because a market waiting on
 * its first walk has rows and no clock, and that is exactly the market that has
 * to be asked again.
 */
function sourcesHoldingRows() {
  const held = new Set();

  for (const entry of queryClient
    .getQueryCache()
    .findAll({ queryKey: ["market", "price"] })) {
    const sourceID = entry.queryKey?.[2];
    if (sourceID) held.add(sourceID);
  }
  return [...held];
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
