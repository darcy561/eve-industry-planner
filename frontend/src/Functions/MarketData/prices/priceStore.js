import { delMany, get, keys, set } from "idb-keyval";

import { MARKET_READ_OUTCOME } from "../registry/marketReadOutcome.js";

/**
 * What a market the reader reads themselves is worth keeping between visits.
 *
 * The tier beneath the price cache: a miss falls through to here before reaching
 * the network. Only a market they paid to read reaches it — a hub is cheap to
 * ask for again and is held for the session alone.
 *
 * **Nothing here may break pricing.** Storage can be absent, blocked, or answer
 * neither way, so every call is bounded and anything but an answer in time is a
 * miss: a reader with no storage still gets prices, fetched every time.
 */

/**
 * How long anything waits on storage before deciding it is not going to answer.
 * Generous against a slow disk, short against a reader watching for a figure.
 *
 * @type {number}
 */
const STORAGE_BUDGET_MS = 2000;

/**
 * The work, or the fallback if storage does not answer in time. The abandoned
 * promise is left pending: there is nothing to cancel, and its answer is no
 * longer wanted.
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
 * Bumped when the shape of anything stored here changes, which abandons what
 * was written under the old one. The cost is that every reader rebuilds their
 * markets once, on the rotation they would have had anyway.
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
 * Where a market's rows are addressed from, and the one place that decides it.
 *
 * Everything under a market's own prefix is what a fresh read replaces whole,
 * so anything kept about a market that is *not* a price lives outside it — see
 * {@link characterKey}.
 */
const marketPrefix = (marketLocation) => `${CURRENT_PREFIX}${marketLocation}|`;

const CHARACTER_PREFIX = "market-character|";
const CURRENT_CHARACTER_PREFIX = `${CHARACTER_PREFIX}v${VERSION}|`;

const FRESHNESS_PREFIX = "market-read|";
const CURRENT_FRESHNESS_PREFIX = `${FRESHNESS_PREFIX}v${VERSION}|`;

const ORDERS_PREFIX = "market-orders|";
const CURRENT_ORDERS_PREFIX = `${ORDERS_PREFIX}v${VERSION}|`;

/**
 * Where the character that last read a market is kept.
 *
 * Deliberately not under that market's row prefix, which
 * `replaceStoredPrices` clears: a record living inside it would be thrown away
 * by the very read that proved it right.
 */
const characterKey = (marketLocation) =>
  `${CURRENT_CHARACTER_PREFIX}${marketLocation}`;

/**
 * Where a market's `readAt` and `expiresAt` are kept, both on this device's
 * clock and deliberately not ESI's `last-modified` — a structure nobody has
 * traded at for days states an old one, and a market judged by it would look
 * untouched the moment it was refreshed.
 *
 * Outside the row prefix for the same reason as {@link characterKey}, and per
 * market rather than on a row because what asks is deciding whether to read the
 * market at all — it has no type in hand to look one up by.
 */
const freshnessKey = (marketLocation) =>
  `${CURRENT_FRESHNESS_PREFIX}${marketLocation}`;

/**
 * Where a market's orders are kept, as ESI returned them.
 *
 * **One value for every order, not one per type.** ESI has no per-type form
 * of a structure's market, so a market's orders arrive together and there is nothing to be
 * gained by taking it apart — a reader wanting one type pays for all of it
 * either way, and splitting it would turn one write into thousands.
 *
 * Kept beside the derived prices rather than instead of them: pricing reads
 * four numbers per type and must not walk every order to get them.
 */
const ordersKey = (marketLocation) =>
  `${CURRENT_ORDERS_PREFIX}${marketLocation}`;

/** @type {Promise<void>|null} */
let pruning = null;

/**
 * Clears out anything written under an earlier shape.
 *
 * A version bump abandons old keys rather than removing them, so nothing would
 * ever reach them again and they would sit on the reader's device for good.
 * Once per session, and not awaited.
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
    } catch {
      // Storage that cannot be read holds nothing worth pruning either.
    }
  })();

  return pruning;
}

/**
 * A row held for one type at one market.
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
 * The character that last read a market's orders, if one is known — kept so the
 * next read asks one character rather than every character. Absent means the
 * next read finds out again.
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
  } catch {
    // A reader whose storage is blocked finds the character again next time,
    // which costs one walk and nothing else.
  }
}

/**
 * Keeps a market's orders as ESI returned them, replacing whatever was held.
 *
 * Whole, because a read of a structure's market is a statement about the whole
 * market: an order filled since the last read is gone rather than
 * stale, and merging would leave it standing.
 *
 * Nothing waits on this and nothing breaks without it. The orders are what a
 * reader browses; the four prices a job is costed against are derived at read
 * time and stored separately, so orders that could not be written cost a
 * reader the browse and not the pricing.
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
  } catch {
    // More orders than the reader's quota will take, or a blocked store. The market
    // still prices: only browsing its orders falls back to the network.
  }
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
 * Puts a market's next turn back without touching what is held for it.
 *
 * For a rotation that could not read it: without this, a market nobody can reach
 * is walked on every probe, and each walk is a refusal per character — which ESI
 * charges at five times a hit. Bounded for a sharper reason than the rest: the
 * rotation waits on it.
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

async function putTurnBack(marketLocation, nextTurnAt, outcome) {
  try {
    const held = await get(freshnessKey(marketLocation));
    // `readAt` is left where it was: a market that could not be read has not
    // been read, and moving it would keep a market nobody can reach alive
    // against the sweep for as long as it went on failing.
    await set(freshnessKey(marketLocation), {
      readAt: held?.readAt ?? 0,
      expiresAt: nextTurnAt,
      outcome: outcome ?? held?.outcome,
    });
  } catch {
    // A market that cannot be deferred is tried again next probe, which is the
    // behaviour this avoids rather than one it has to guarantee.
  }
}

/**
 * When a market was last read, and when it is due again. Answers for a market
 * whose rows are no longer in memory, which is what makes a rotation one: the
 * cache lets an unwatched row go long before the market is due.
 *
 * Carries `outcome` — one of MARKET_READ_OUTCOME — on a market read here, which
 * is what a panel says when the figures did not arrive.
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
 * Long enough that a market on the hour is never near it, short enough that a
 * reader coming back to a machine after a break rebuilds rather than opening on
 * yesterday's figures.
 *
 * @type {number}
 */
export const UNREAD_MARKET_MS = 24 * 60 * 60 * 1000;

/**
 * Throws away everything held for a market nothing has read in a day.
 *
 * **This is what bounds the tier.** A market is refreshed because the reader
 * still has it saved, so one they have removed — or one no character can reach
 * any more — simply stops being refreshed, and nothing else would ever throw
 * its rows away.
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
        ...held.filter((row) => row.startsWith(marketPrefix(marketLocation))),
      ]);
      dropped += 1;
    }

    return dropped;
  } catch {
    // Storage that cannot be swept holds nothing that will be served either:
    // every read through it answers as a miss.
    return 0;
  }
}

/**
 * Asked for each market as it is reached rather than for all of them up front:
 * deciding about every market first and deleting afterwards threw away one
 * refreshed while the scan was still walking, losing the walk just paid for.
 */
async function stillUnread(marketLocation, now) {
  const readAt = (await get(freshnessKey(marketLocation)))?.readAt;

  // Absent is a market never read successfully. Its record is what paces the
  // attempts, and it holds no rows to throw away.
  return readAt > 0 && now - readAt > UNREAD_MARKET_MS;
}

/**
 * Everything held for one market, thrown away and written again from what a
 * fresh read says.
 *
 * **Cleared rather than reconciled.** A whole-market read is a statement about
 * every type on it, so what was there before it has no standing — working out
 * which rows the new set happens to keep would cost a comparison to arrive
 * where clearing arrives anyway.
 *
 * **Its caller waits on this**, unlike the reads around it: a surface woken by
 * the market's clock moving reads through here, so it must find the new rows.
 *
 * @param {string} marketLocation
 * @param {Map<string, object>|Array<[string, object]>} rows - Type id to row
 * @param {{refreshedAt: number, expiresAt: number}} freshness - The moment ESI
 *   stated for these orders, and when the market is due again
 * @returns {Promise<void>}
 */
export async function replaceStoredPrices(marketLocation, rows, freshness) {
  prunePastVersions();
  await withinBudget(writeMarket(marketLocation, rows, freshness), undefined);
}

async function writeMarket(marketLocation, rows, freshness) {
  const prefix = marketPrefix(marketLocation);

  try {
    const held = (await keys()).filter(
      (key) => typeof key === "string" && key.startsWith(prefix),
    );
    if (held.length) await delMany(held);

    await Promise.all(
      [...new Map(rows)].map(([typeID, row]) =>
        set(entryKey(marketLocation, typeID), {
          ...row,
          refreshedAt: freshness.refreshedAt,
        }),
      ),
    );

    // Written last, so a torn row write never reaches it: a market whose rows
    // only partly landed keeps the record that said it was due — which is why
    // this read happened — rather than one claiming a read it did not finish.
    await set(freshnessKey(marketLocation), {
      readAt: Date.now(),
      expiresAt: freshness.expiresAt,
      // Prices arrived, so whatever the last turn could not do is no longer
      // true of this market and must not outlive the read that disproved it.
      outcome: MARKET_READ_OUTCOME.READ,
    });
  } catch {
    // A reader whose storage is full or blocked prices from the network
    // instead, which is the tier working as designed.
  }
}

/** Lets a test run the once-per-session prune again. */
export function resetPriceStore() {
  pruning = null;
}
