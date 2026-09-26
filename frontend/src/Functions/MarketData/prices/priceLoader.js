import { fetchMarketPricesQuery } from "../../Endpoints/Public/marketPricesQuery";
import { readCitadelPrices } from "../citadels/citadelPrices.js";
import {
  allMarketSources,
  isReadByTheReader,
  SOURCE_KIND,
  sourceIn,
  wantKey,
} from "../registry/marketSources.js";
import { replaceStoredOrders, replaceStoredPrices } from "./priceStore";

/**
 * What a tick has been asked for, and everyone waiting on each want, keyed so
 * two callers wanting the same thing wait on one lookup.
 *
 * @type {Map<string, {resolve: Function, reject: Function}[]>}
 */
const pending = new Map();
let flushScheduled = false;

const adjustedKey = (typeID) => `adjusted|${typeID}`;

/**
 * Asks for one type's price at one market, batched with whatever else is asked
 * for in the same tick and issued as one request per transport.
 *
 * @param {number|string} typeID
 * @param {string} marketLocation - A market source id
 * @returns {Promise<{buy: number, sell: number, buyP95: number, sellP05: number,
 *   refreshedAt: number}|null>} null where the market holds no order for the type
 */
export function requestPrice(typeID, marketLocation) {
  return enqueue(wantKey(marketLocation, typeID));
}

/**
 * Reads a market for its own sake rather than for any type's price, for a
 * rotation that wants the market fresh and not a figure.
 *
 * @param {string} marketLocation - A market the reader reads themselves
 * @returns {Promise<void>}
 * @throws whatever reading the market threw
 */
export async function requestMarketRead(marketLocation) {
  const source = sourceIn(allMarketSources(), marketLocation);
  if (!isReadByTheReader(source?.kind)) return;

  await readAndKeep(marketLocation, source);
}

/**
 * Asks for one type's adjusted price, batched with the same tick's prices.
 *
 * @param {number|string} typeID
 * @returns {Promise<number|null>}
 */
export function requestAdjustedPrice(typeID) {
  return enqueue(adjustedKey(typeID));
}

function enqueue(key) {
  return new Promise((resolve, reject) => {
    const waiters = pending.get(key);
    if (waiters) {
      waiters.push({ resolve, reject });
    } else {
      pending.set(key, [{ resolve, reject }]);
    }

    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(flush, 0);
    }
  });
}

/**
 * Settles one tick's wants, every one of them, whatever fails, this running from
 * a timer where an escaping rejection is reported nowhere.
 */
async function flush() {
  const batch = new Map(pending);
  pending.clear();
  flushScheduled = false;
  if (batch.size === 0) return;

  try {
    const { served, walked, adjusted, unaskable } = splitByTransport(batch);

    await Promise.all([serveServerHeld(served, adjusted), serveWalked(walked)]);

    for (const want of unaskable) {
      rejectWant(
        want,
        new Error(`no market source named "${want.marketLocation}"`),
      );
    }
  } catch (error) {
    for (const waiters of batch.values()) {
      for (const waiter of waiters) waiter.reject(error);
    }
  }
}

/**
 * Sorts a tick's wants by who can answer them, taking the kind from the registry
 * rather than from the want. One the registry does not carry cannot be asked.
 */
function splitByTransport(batch) {
  const sources = allMarketSources();
  const served = [];
  const walked = [];
  const adjusted = [];
  const unaskable = [];

  for (const [key, waiters] of batch) {
    const [head, typeID] = key.split("|");
    if (head === "adjusted") {
      adjusted.push({ typeID, waiters });
      continue;
    }

    const source = sourceIn(sources, head);
    const want = { typeID, marketLocation: head, source, waiters };

    if (!source) {
      unaskable.push(want);
    } else if (isReadByTheReader(source.kind)) {
      walked.push(want);
    } else {
      served.push(want);
    }
  }

  return { served, walked, adjusted, unaskable };
}

/**
 * What a market is called on the wire: a hub by its id, a saved station by the
 * station it sits at. The reader's own id never leaves here.
 *
 * @param {{id: string, kind: string, stationID?: number}} source
 * @returns {string}
 */
function transportIDFor(source) {
  return source?.kind === SOURCE_KIND.STATION
    ? String(source.stationID)
    : source?.id;
}

/** The markets this server prices, asked for in one query. */
async function serveServerHeld(wants, adjusted) {
  if (wants.length === 0 && adjusted.length === 0) return;

  try {
    const answer = await fetchMarketPricesQuery({
      wants: wants.map(({ typeID, source }) => ({
        typeID,
        marketLocation: transportIDFor(source),
      })),
      adjustedTypeIDs: adjusted.map(({ typeID }) => typeID),
    });

    announceRefreshTimes(answer, wants);

    for (const want of wants) {
      const block = answer.sources?.[transportIDFor(want.source)];
      resolveWant(want, typePriceFrom(block, want.typeID));
    }
    for (const want of adjusted) {
      resolveWant(want, answer.adjusted?.prices?.[want.typeID] ?? null);
    }
  } catch (error) {
    for (const want of [...wants, ...adjusted]) rejectWant(want, error);
  }
}

/**
 * The citadels a tick named, each read once however many types were asked for, a
 * structure's market having no per-type form.
 */
async function serveWalked(wants) {
  if (wants.length === 0) return;

  const byMarket = new Map();
  for (const want of wants) {
    const group = byMarket.get(want.marketLocation);
    if (group) {
      group.push(want);
    } else {
      byMarket.set(want.marketLocation, [want]);
    }
  }

  await Promise.all(
    [...byMarket.values()].map((group) => serveOneCitadel(group)),
  );
}

async function serveOneCitadel(wants) {
  const { marketLocation, source } = wants[0];

  let prices;
  try {
    prices = await readAndKeep(marketLocation, source);
  } catch (error) {
    for (const want of wants) rejectWant(want, error);
    return;
  }

  for (const want of wants) {
    const typePrice = prices.typePrices.get(String(want.typeID));
    resolveWant(
      want,
      typePrice ? { ...typePrice, refreshedAt: prices.refreshedAt } : null,
    );
  }
}

/**
 * A read-and-keep already under way for a market, so a second asker joins it.
 *
 * @type {Map<string, Promise<import("../citadels/citadelPrices.js").CitadelPrices>>}
 */
const reading = new Map();

/**
 * Everything a read of a whole market owes, shared by a tick's wants and a
 * rotation, and run one at a time per market with the keeping included.
 */
function readAndKeep(marketLocation, source) {
  const underWay = reading.get(marketLocation);
  if (underWay) return underWay;

  const work = keepWhatIsRead(marketLocation, source).finally(() =>
    reading.delete(marketLocation),
  );
  reading.set(marketLocation, work);

  return work;
}

/**
 * Keeps what a whole-market read returned, announcing last because a surface
 * woken by it reads through the store.
 */
async function keepWhatIsRead(marketLocation, source) {
  const prices = await readCitadelPrices(source);

  await replaceStoredPrices(marketLocation, prices.typePrices, {
    refreshedAt: prices.refreshedAt,
    expiresAt: prices.expiresAt,
  });

  replaceStoredOrders(marketLocation, prices.orders, prices.refreshedAt)
    .then(() => onOrdersStored?.(marketLocation))
    .catch(() => {});

  onMarketsRefreshed?.({
    markets: [{ marketLocation, refreshedAt: prices.refreshedAt }],
  });

  return prices;
}

function resolveWant(want, value) {
  for (const waiter of want.waiters) waiter.resolve(value);
}

function rejectWant(want, error) {
  for (const waiter of want.waiters) waiter.reject(error);
}

/**
 * Announces the refresh time every market in an answer carried, per market asked
 * for rather than per block answered.
 *
 * @param {import("../../Endpoints/Public/marketPricesQuery").MarketPricesQueryResult} answer
 */
function announceRefreshTimes(answer, wants) {
  const markets = [];
  const asked = new Set();
  const answered = new Set();

  for (const want of wants ?? []) {
    answered.add(transportIDFor(want.source));
    if (asked.has(want.marketLocation)) continue;
    asked.add(want.marketLocation);

    markets.push({
      marketLocation: want.marketLocation,
      refreshedAt: answer?.sources?.[transportIDFor(want.source)]?.refreshedAt,
    });
  }
  for (const [marketLocation, block] of Object.entries(answer?.sources ?? {})) {
    if (answered.has(marketLocation)) continue;
    markets.push({ marketLocation, refreshedAt: block?.refreshedAt });
  }

  onMarketsRefreshed?.({
    markets,
    adjustedRefreshedAt: answer?.adjusted?.refreshedAt,
  });
}

/**
 * @typedef {object} MarketsRefreshed
 * @property {Array<{marketLocation: string, refreshedAt: number|undefined}>}
 *   markets - Each market an answer named, with the refresh time it stated
 * @property {number} [adjustedRefreshedAt]
 */

/** @type {((refreshed: MarketsRefreshed) => void)|null} */
let onMarketsRefreshed = null;

/**
 * Sets what to tell when a market has answered. The loader announces and the
 * cache decides, holding the prices a refresh supersedes.
 *
 * @param {((refreshed: MarketsRefreshed) => void)|null} listener
 */
export function setMarketRefreshedListener(listener) {
  onMarketsRefreshed = listener;
}

/** @type {((marketLocation: string) => void)|null} */
let onOrdersStored = null;

/**
 * Sets what to tell when a market's stored orders have been replaced, which is a
 * different fact from the refresh time above rather than a second way of hearing it.
 *
 * @param {((marketLocation: string) => void)|null} listener
 */
export function setOrdersStoredListener(listener) {
  onOrdersStored = listener;
}

/**
 * What the answer held for one want, settling as null where it says nothing
 * because a market holding no order is an answer.
 */
function typePriceFrom(block, typeID) {
  const typePrice = block?.prices?.[typeID];
  if (!typePrice) return null;
  return { ...typePrice, refreshedAt: block.refreshedAt ?? 0 };
}

/**
 * Forgets a tick's pending wants, for tests, leaving the listeners in place
 * because the cache registers them once on import and cannot do so again.
 */
export function resetPriceLoader() {
  pending.clear();
  flushScheduled = false;
}
