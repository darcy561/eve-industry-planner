import { delMany, get, keys, set } from "idb-keyval";

import { MARKET_READ_OUTCOME } from "../registry/marketReadOutcome.js";

/**
 * How long anything waits on storage before deciding it is not going to answer.
 * Generous against a slow disk, short against a reader watching for a figure.
 *
 * @type {number}
 */
const STORAGE_BUDGET_MS = 2000;

/**
 * The work, or the fallback if storage does not answer in time, the abandoned
 * promise being left pending.
 */
function withinBudget(work, fallback) {
  return Promise.race([
    work,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), STORAGE_BUDGET_MS);
    }),
  ]);
}

/**
 * Bumped when the shape of anything stored here changes, which abandons what was
 * written under the old one.
 */
const VERSION = 1;

/**
 * The version the keys above carry, so a test can name a key the store writes
 * without spelling the number a second time and going stale on the next bump.
 */
export const STORE_VERSION = VERSION;

const PREFIX = "price|";
const CURRENT_PREFIX = `${PREFIX}v${VERSION}|`;

const entryKey = (marketLocation, typeID) =>
  `${CURRENT_PREFIX}${marketLocation}|${typeID}`;

/**
 * Where a market's prices are addressed from. Everything under this prefix is
 * what a fresh read replaces whole.
 */
const marketPrefix = (marketLocation) => `${CURRENT_PREFIX}${marketLocation}|`;

const CHARACTER_PREFIX = "market-character|";
const CURRENT_CHARACTER_PREFIX = `${CHARACTER_PREFIX}v${VERSION}|`;

const FRESHNESS_PREFIX = "market-read|";
const CURRENT_FRESHNESS_PREFIX = `${FRESHNESS_PREFIX}v${VERSION}|`;

const ORDERS_PREFIX = "market-orders|";
const CURRENT_ORDERS_PREFIX = `${ORDERS_PREFIX}v${VERSION}|`;

/**
 * Where the character that last read a market is kept, outside the price prefix
 * that a fresh read clears.
 */
const characterKey = (marketLocation) =>
  `${CURRENT_CHARACTER_PREFIX}${marketLocation}`;

/**
 * Where a market's `readAt` and `expiresAt` are kept, on this device's clock
 * rather than ESI's `last-modified`, and outside the price prefix.
 */
const freshnessKey = (marketLocation) =>
  `${CURRENT_FRESHNESS_PREFIX}${marketLocation}`;

/**
 * Where a market's orders are kept as ESI returned them, one value for every
 * order and beside the derived prices rather than instead of them.
 */
const ordersKey = (marketLocation) =>
  `${CURRENT_ORDERS_PREFIX}${marketLocation}`;

/** @type {Promise<void>|null} */
let pruning = null;

/**
 * Clears out anything written under an earlier shape, once per session and not
 * awaited.
 */
function prunePastVersions() {
  pruning ??= (async () => {
    try {
      const abandoned = (await keys()).filter(
        (key) =>
          typeof key === "string" &&
          ((key.startsWith(PREFIX) && !key.startsWith(CURRENT_PREFIX)) ||
            (key.startsWith(CHARACTER_PREFIX) &&
              !key.startsWith(CURRENT_CHARACTER_PREFIX)) ||
            (key.startsWith(ORDERS_PREFIX) &&
              !key.startsWith(CURRENT_ORDERS_PREFIX)) ||
            (key.startsWith(FRESHNESS_PREFIX) &&
              !key.startsWith(CURRENT_FRESHNESS_PREFIX))),
      );

      if (abandoned.length > 0) await delMany(abandoned);
    } catch {}
  })();

  return pruning;
}

/**
 * A price held for one type at one market.
 *
 * @param {string} marketLocation
 * @param {number|string} typeID
 * @returns {Promise<object|undefined>} undefined where nothing is held
 */
export async function readStoredPrice(marketLocation, typeID) {
  prunePastVersions();
  return withinBudget(readEntry(marketLocation, typeID), undefined);
}

async function readEntry(marketLocation, typeID) {
  try {
    return (await get(entryKey(marketLocation, typeID))) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The character that last read a market's orders, so the next read asks one
 * rather than every one. Absent means it finds out again.
 *
 * @param {string} marketLocation
 * @returns {Promise<string|undefined>}
 */
export async function readMarketCharacter(marketLocation) {
  prunePastVersions();
  return withinBudget(characterHeld(marketLocation), undefined);
}

async function characterHeld(marketLocation) {
  try {
    const hash = await get(characterKey(marketLocation));
    return typeof hash === "string" && hash ? hash : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keeps the character that read a market.
 *
 * @param {string} marketLocation
 * @param {string} characterHash
 * @returns {Promise<void>}
 */
export async function writeMarketCharacter(marketLocation, characterHash) {
  if (!characterHash) return;
  prunePastVersions();

  try {
    await set(characterKey(marketLocation), characterHash);
  } catch {}
}

/**
 * Keeps a market's orders as ESI returned them, replacing whatever was held
 * whole. Nothing waits on this and pricing does not depend on it.
 *
 * @param {string} marketLocation
 * @param {Array<object>} orders - Orders as ESI returned them
 * @param {number} refreshedAt - The moment ESI stated for them
 * @returns {Promise<void>}
 */
export async function replaceStoredOrders(marketLocation, orders, refreshedAt) {
  prunePastVersions();
  await withinBudget(
    writeOrders(marketLocation, orders, refreshedAt),
    undefined,
  );
}

async function writeOrders(marketLocation, orders, refreshedAt) {
  try {
    await set(ordersKey(marketLocation), {
      orders: orders ?? [],
      refreshedAt,
    });
  } catch {}
}

/**
 * A market's orders as they were last read here.
 *
 * @param {string} marketLocation
 * @returns {Promise<{orders: Array<object>, refreshedAt: number}|undefined>}
 */
export async function readStoredOrders(marketLocation) {
  prunePastVersions();
  return withinBudget(ordersHeld(marketLocation), undefined);
}

async function ordersHeld(marketLocation) {
  try {
    const held = await get(ordersKey(marketLocation));
    return Array.isArray(held?.orders) ? held : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Puts a market's next turn back without touching what is held for it, for a
 * rotation that could not read it and must not retry on every probe.
 *
 * @param {string} marketLocation
 * @param {number} nextTurnAt
 * @param {string} [outcome] - One of MARKET_READ_OUTCOME, where the caller knows
 *   what the attempt settled on
 * @returns {Promise<void>}
 */
export async function deferMarket(marketLocation, nextTurnAt, outcome) {
  prunePastVersions();
  await withinBudget(
    putTurnBack(marketLocation, nextTurnAt, outcome),
    undefined,
  );
}

/**
 * Puts a market's next turn back without claiming a read, leaving `readAt` where
 * it was so a market nobody can reach still ages out.
 */
async function putTurnBack(marketLocation, nextTurnAt, outcome) {
  try {
    const held = await get(freshnessKey(marketLocation));
    await set(freshnessKey(marketLocation), {
      readAt: held?.readAt ?? 0,
      expiresAt: nextTurnAt,
      outcome: outcome ?? held?.outcome,
    });
  } catch {}
}

/**
 * When a market was last read, when it is due again, and what the last attempt
 * settled on. Answers for a market whose prices are no longer in memory.
 *
 * @param {string} marketLocation
 * @returns {Promise<{readAt: number, expiresAt: number, outcome?: string}|undefined>}
 */
export async function readMarketFreshness(marketLocation) {
  prunePastVersions();
  return withinBudget(freshnessHeld(marketLocation), undefined);
}

async function freshnessHeld(marketLocation) {
  try {
    const held = await get(freshnessKey(marketLocation));
    return Number.isFinite(held?.readAt) ? held : undefined;
  } catch {
    return undefined;
  }
}

/**
 * How long a market goes unread before everything held for it is thrown away,
 * which a market on the hour never comes near.
 *
 * @type {number}
 */
export const UNREAD_MARKET_MS = 24 * 60 * 60 * 1000;

/**
 * Throws away everything held for a market nothing has read in a day, which is
 * what bounds the tier.
 *
 * @param {number} [now]
 * @returns {Promise<number>} How many markets were dropped
 */
export async function dropUnreadMarkets(now = Date.now()) {
  prunePastVersions();
  return withinBudget(sweepUnread(now), 0);
}

async function sweepUnread(now) {
  try {
    const held = (await keys()).filter((key) => typeof key === "string");
    let dropped = 0;

    for (const key of held.filter((key) =>
      key.startsWith(CURRENT_FRESHNESS_PREFIX),
    )) {
      const marketLocation = key.slice(CURRENT_FRESHNESS_PREFIX.length);
      if (!(await stillUnread(marketLocation, now))) continue;

      await delMany([
        key,
        characterKey(marketLocation),
        ordersKey(marketLocation),
        ...held.filter((priceKey) =>
          priceKey.startsWith(marketPrefix(marketLocation)),
        ),
      ]);
      dropped += 1;
    }

    return dropped;
  } catch {
    return 0;
  }
}

/**
 * Whether a market is past the bound, asked as each is reached rather than for
 * all of them before any is deleted.
 */
async function stillUnread(marketLocation, now) {
  const readAt = (await get(freshnessKey(marketLocation)))?.readAt;

  return readAt > 0 && now - readAt > UNREAD_MARKET_MS;
}

/**
 * Everything held for one market, cleared rather than reconciled and written
 * again from what a fresh read says. Its caller waits on this.
 *
 * @param {string} marketLocation
 * @param {Map<string, object>|Array<[string, object]>} typePrices - Type id to its prices
 * @param {{refreshedAt: number, expiresAt: number}} freshness - The moment ESI
 *   stated for these orders, and when the market is due again
 * @returns {Promise<void>}
 */
export async function replaceStoredPrices(
  marketLocation,
  typePrices,
  freshness,
) {
  prunePastVersions();
  await withinBudget(
    writeMarket(marketLocation, typePrices, freshness),
    undefined,
  );
}

async function writeMarket(marketLocation, typePrices, freshness) {
  const prefix = marketPrefix(marketLocation);

  try {
    const held = (await keys()).filter(
      (key) => typeof key === "string" && key.startsWith(prefix),
    );
    if (held.length) await delMany(held);

    await Promise.all(
      [...new Map(typePrices)].map(([typeID, typePrice]) =>
        set(entryKey(marketLocation, typeID), {
          ...typePrice,
          refreshedAt: freshness.refreshedAt,
        }),
      ),
    );

    await set(freshnessKey(marketLocation), {
      readAt: Date.now(),
      expiresAt: freshness.expiresAt,
      outcome: MARKET_READ_OUTCOME.READ,
    });
  } catch {}
}

/** Lets a test run the once-per-session prune again. */
export function resetPriceStore() {
  pruning = null;
}
