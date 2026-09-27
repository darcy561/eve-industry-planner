import { queryClient } from "../../../queryClient";
import {
  allMarketSources,
  answersAPerTypeProbe,
  isReadByTheReader,
  persistsAcrossSessions,
  sourceIn,
  wantKey,
} from "../registry/marketSources.js";
import {
  requestAdjustedPrice,
  requestMarketRead,
  requestPrice,
  setMarketRefreshedListener,
  setOrdersStoredListener,
} from "./priceLoader";
import {
  deferMarket,
  readMarketFreshness,
  readStoredPrice,
} from "./priceStore";
import { PRICE_ROTATION_MS } from "../citadels/citadelPrices.js";
import {
  outcomeOfFailedRead,
  readerCanAct,
} from "../registry/marketReadOutcome.js";
import { CITADEL_ORDERS_QUERY_KEY } from "../citadels/ordersAtCitadels.js";

/**
 * How long a held price counts as fresh. Static: never stale by age, and not by
 * invalidation either — its market's refresh time decides.
 *
 * @type {import("@tanstack/react-query").StaleTime}
 */
const PRICE_STALE_TIME = "static";

/**
 * How long a price is kept. Nothing watches one, so this is how long it lives,
 * and it sits below the rotation.
 *
 * @type {number}
 */
const PRICE_CACHE_TIME = 30 * 60 * 1000;

/**
 * Where a market's prices are held. Every key for one is built from this.
 *
 * @param {string} marketLocation
 * @returns {string[]}
 */
const marketPricesKey = (marketLocation) => [
  "market",
  "price",
  String(marketLocation),
];

/** @type {string[]} */
const ADJUSTED_PRICES_QUERY_KEY = ["market", "adjusted"];

/**
 * Where the adjusted block's own refresh time is held, its prices being bare
 * numbers that carry none.
 *
 * @type {string[]}
 */
const ADJUSTED_REFRESHED_AT_KEY = ["market", "adjustedRefreshedAt"];

/**
 * What a surface waiting on a set of prices is keyed under. Here because this
 * module and the hook above it both build on it.
 *
 * @type {string[]}
 */
export const MARKET_PRICES_QUERY_KEY = ["market", "prices"];

/** @param {number|string} typeID @param {string} marketLocation */
export const priceQueryKey = (typeID, marketLocation) => [
  ...marketPricesKey(marketLocation),
  String(typeID),
];

/** @param {number|string} typeID */
export const adjustedQueryKey = (typeID) => [
  ...ADJUSTED_PRICES_QUERY_KEY,
  String(typeID),
];

/**
 * One type's price at one market, or undefined where none is held — whether
 * unasked or holding no order.
 *
 * @param {number|string} typeID
 * @param {string} marketLocation
 * @returns {{buy: number, sell: number, buyP95: number, sellP05: number,
 *   refreshedAt: number}|undefined}
 */
export function readPrice(typeID, marketLocation) {
  return (
    queryClient.getQueryData(priceQueryKey(typeID, marketLocation)) ?? undefined
  );
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
 * Asks for each type at the market it is priced against, taking pairs rather
 * than a cross product, and resolves once every want has settled.
 *
 * @param {object} params
 * @param {Iterable<{typeID: number|string, marketLocation: string}>} params.wants
 * @param {Iterable<number|string>} [params.adjustedTypeIDs] - Types whose
 *   adjusted price is also wanted. Source-independent, so named apart
 * @returns {Promise<{asked: number, failed: number}>} How many wants were put to
 *   the loader and how many could not be answered, so a caller can tell one
 *   unreachable market from nothing having worked at all
 */
export async function fetchPrices({ wants, adjustedTypeIDs = [] }) {
  const asked = [];
  const seen = new Set();

  for (const { typeID, marketLocation } of wants ?? []) {
    if (typeID == null || !marketLocation) continue;
    const key = wantKey(marketLocation, typeID);
    if (seen.has(key)) continue;
    seen.add(key);

    asked.push(
      queryClient.query({
        queryKey: priceQueryKey(typeID, marketLocation),
        queryFn: () => resolvePrice(typeID, marketLocation),
        staleTime: PRICE_STALE_TIME,
        gcTime: PRICE_CACHE_TIME,
        retry: false,
      }),
    );
  }

  for (const typeID of new Set(Array.from(adjustedTypeIDs, String))) {
    asked.push(
      queryClient.query({
        queryKey: adjustedQueryKey(typeID),
        queryFn: () => requestAdjustedPrice(typeID),
        staleTime: PRICE_STALE_TIME,
        gcTime: PRICE_CACHE_TIME,
        retry: false,
      }),
    );
  }

  const settled = await Promise.allSettled(asked);

  return {
    asked: settled.length,
    failed: settled.filter((result) => result.status === "rejected").length,
  };
}

/**
 * One price, from whichever tier can answer for it, and the only seam the
 * persistent tier enters at.
 */
async function resolvePrice(typeID, marketLocation) {
  const source = sourceIn(allMarketSources(), marketLocation);

  if (!persistsAcrossSessions(source?.kind)) {
    return requestPrice(typeID, marketLocation);
  }

  const stored = await readStoredPrice(marketLocation, typeID);
  if (stored) return stored;

  return requestPrice(typeID, marketLocation);
}

/**
 * Drops the prices each announced refresh superseded, removing rather than
 * invalidating them, and wakes the surfaces drawing them.
 */
setMarketRefreshedListener(({ markets, adjustedRefreshedAt }) => {
  let moved = false;

  for (const { marketLocation, refreshedAt } of markets ?? []) {
    if (dropPricesOlderThan(marketLocation, refreshedAt)) moved = true;
  }

  if (adjustedHasMovedPast(adjustedRefreshedAt)) {
    queryClient.removeQueries({ queryKey: ADJUSTED_PRICES_QUERY_KEY });
    moved = true;
  }

  if (moved)
    queryClient.invalidateQueries({ queryKey: MARKET_PRICES_QUERY_KEY });
});

/**
 * Drops each price a market holds that was read before the refresh it has just
 * announced, and says whether any went.
 */
function dropPricesOlderThan(marketLocation, refreshedAt) {
  if (!Number.isFinite(refreshedAt) || refreshedAt <= 0) return false;

  let dropped = false;

  for (const entry of queryClient.getQueryCache().findAll({
    queryKey: marketPricesKey(marketLocation),
  })) {
    if (!supersededBy(entry, refreshedAt)) continue;
    queryClient.removeQueries({ queryKey: entry.queryKey, exact: true });
    dropped = true;
  }

  return dropped;
}

/**
 * Whether a settled price was read before a refresh. One carrying no refresh
 * time at all was, having come from before its market was walked.
 */
function supersededBy(entry, refreshedAt) {
  if (entry.state.status !== "success") return false;

  const held = entry.state.data?.refreshedAt;

  return !Number.isFinite(held) || held < refreshedAt;
}

/**
 * When the adjusted block last refreshed, or undefined before it has answered.
 *
 * @returns {number|undefined}
 */
export function readAdjustedRefreshTime() {
  return queryClient.getQueryData(ADJUSTED_REFRESHED_AT_KEY);
}

/**
 * Records the moment the adjusted block states and answers whether it moved,
 * ignoring an older moment rather than writing it.
 */
function adjustedHasMovedPast(refreshedAt) {
  if (!Number.isFinite(refreshedAt) || refreshedAt <= 0) return false;

  const held = queryClient.getQueryData(ADJUSTED_REFRESHED_AT_KEY);
  if (held !== undefined && refreshedAt <= held) return false;

  queryClient.setQueryData(ADJUSTED_REFRESHED_AT_KEY, refreshedAt);

  return held !== undefined;
}

/**
 * The market's own refresh time, read from the newest its held prices carry, or
 * undefined where none carries one.
 *
 * @param {string} marketLocation
 * @returns {number|undefined}
 */
export function readHeldRefreshTime(marketLocation) {
  let newest;

  for (const entry of queryClient.getQueryCache().findAll({
    queryKey: marketPricesKey(marketLocation),
  })) {
    const refreshedAt = entry.state.data?.refreshedAt;
    if (!Number.isFinite(refreshedAt)) continue;
    if (newest === undefined || refreshedAt > newest) newest = refreshedAt;
  }

  return newest;
}

/**
 * Tells a surface browsing a market's orders that they have been replaced, that
 * surface waiting on nobody.
 */
setOrdersStoredListener(() => {
  queryClient.invalidateQueries({ queryKey: CITADEL_ORDERS_QUERY_KEY });
});

/**
 * Reads again, before anybody asks, every market the reader saved whose turn has
 * come round, taking due-ness from the device rather than from memory.
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
    refused.map(({ marketLocation, outcome }) =>
      deferMarket(marketLocation, now + PRICE_ROTATION_MS, outcome),
    ),
  );

  return rotating.length;
}

/**
 * Reads every market at once, and says which of them answered something about
 * the market itself rather than merely failing.
 *
 * @param {string[]} marketLocations
 * @returns {Promise<Array<{marketLocation: string, outcome: string}>>}
 */
async function readEach(marketLocations) {
  const settled = [];

  await Promise.all(
    marketLocations.map(async (marketLocation) => {
      try {
        await requestMarketRead(marketLocation);
      } catch (error) {
        const outcome = outcomeOfFailedRead(error);
        if (readerCanAct(outcome)) settled.push({ marketLocation, outcome });
      }
    }),
  );

  return settled;
}

/**
 * Whether a market's turn has come. Nothing on record is a market never read,
 * which is due now.
 */
function isDue(freshness, now) {
  return !freshness || !(freshness.expiresAt > now);
}

/**
 * Asks every market this server prices for one type it already holds, the answer
 * carrying the refresh time that is how a refresh is noticed.
 *
 * @returns {Promise<void>}
 */
export async function revalidateMarketRefreshTimes() {
  const sources = allMarketSources();
  const wants = [];

  for (const marketLocation of marketsHoldingPrices()) {
    if (!answersAPerTypeProbe(sourceIn(sources, marketLocation)?.kind))
      continue;

    const typeID = anyHeldTypeAt(marketLocation);
    if (typeID !== undefined) wants.push({ typeID, marketLocation });
  }

  await Promise.allSettled(
    wants.map(({ typeID, marketLocation }) =>
      requestPrice(typeID, marketLocation),
    ),
  );
}

/** Every market the cache holds an entry for, answered or not. */
function marketsHoldingPrices() {
  const held = new Set();

  for (const entry of queryClient
    .getQueryCache()
    .findAll({ queryKey: ["market", "price"] })) {
    const marketLocation = entry.queryKey?.[2];
    if (marketLocation) held.add(marketLocation);
  }
  return [...held];
}

/** One type this market has an entry for, whichever comes first. */
function anyHeldTypeAt(marketLocation) {
  const [entry] = queryClient.getQueryCache().findAll({
    queryKey: marketPricesKey(marketLocation),
  });

  return entry?.queryKey?.[3];
}
