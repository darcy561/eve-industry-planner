import { del, delMany, get, keys, set } from "idb-keyval";
import { hasLapsed, withFreshness } from "./priceFreshness";

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

/** Bumped when a stored row's shape changes, which abandons the old rows. */
const VERSION = 1;

const PREFIX = "price|";
const CURRENT_PREFIX = `${PREFIX}v${VERSION}|`;

const entryKey = (sourceID, typeID) => `${CURRENT_PREFIX}${sourceID}|${typeID}`;

/**
 * Where a market's rows are addressed from, and the one place that decides it.
 *
 * Everything under a market's own prefix is what a fresh read replaces whole,
 * so anything kept about a market that is *not* a price lives outside it — see
 * {@link characterKey}.
 */
const marketPrefix = (sourceID) => `${CURRENT_PREFIX}${sourceID}|`;

const CHARACTER_PREFIX = "market-character|";
const CURRENT_CHARACTER_PREFIX = `${CHARACTER_PREFIX}v${VERSION}|`;

const FRESHNESS_PREFIX = "market-read|";
const CURRENT_FRESHNESS_PREFIX = `${FRESHNESS_PREFIX}v${VERSION}|`;

/**
 * Where the character that last read a market is kept.
 *
 * Deliberately not under that market's row prefix: `replaceStoredPrices`
 * removes everything there that the new read did not mention, so a record
 * living inside it would be thrown away by the very read that proved it
 * right.
 */
const characterKey = (sourceID) => `${CURRENT_CHARACTER_PREFIX}${sourceID}`;

/**
 * Where the moment a market was last read is kept.
 *
 * Outside the row prefix for the same reason as {@link characterKey}, and kept
 * per market rather than read off a row because what asks is deciding whether
 * to read the market at all — it has no type in hand to look one up by.
 */
const freshnessKey = (sourceID) => `${CURRENT_FRESHNESS_PREFIX}${sourceID}`;

/** @type {Promise<void>|null} */
let pruning = null;

/**
 * Clears out anything written under an earlier shape.
 *
 * A version bump abandons old keys rather than removing them, so nothing reads
 * them again and the per-row eviction can never reach them — they would sit on
 * the reader's device for good. Once per session, and not awaited.
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
 * A row held for one type at one market, if one is still good.
 *
 * **A lapsed row is dropped as it is found**, which is the whole of the eviction
 * path: a row nothing visits is one nothing is paying for, and sweeping on a
 * timer would spend work to learn that.
 *
 * @param {string} sourceID
 * @param {number|string} typeID
 * @param {number} [now] - For tests
 * @returns {Promise<object|undefined>} undefined where nothing usable is held
 */
export async function readStoredPrice(sourceID, typeID, now = Date.now()) {
  prunePastVersions();
  return withinBudget(readEntry(sourceID, typeID, now), undefined);
}

async function readEntry(sourceID, typeID, now) {
  const key = entryKey(sourceID, typeID);

  try {
    const row = await get(key);
    if (!row) return undefined;

    // Serving a lapsed row would be worse than having stored nothing, because
    // nothing above this would ever ask again.
    if (hasLapsed(row.expiresAt, now)) {
      await del(key);
      return undefined;
    }

    return row;
  } catch {
    return undefined;
  }
}

/**
 * The character that last read a market's orders, if one is known — kept so the
 * next read asks one character rather than every character. Absent means the
 * next read finds out again.
 *
 * @param {string} sourceID
 * @returns {Promise<string|undefined>}
 */
export async function readMarketCharacter(sourceID) {
  prunePastVersions();
  return withinBudget(characterHeld(sourceID), undefined);
}

async function characterHeld(sourceID) {
  try {
    const hash = await get(characterKey(sourceID));
    return typeof hash === "string" && hash ? hash : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keeps the character that read a market.
 *
 * @param {string} sourceID
 * @param {string} characterHash
 * @returns {Promise<void>}
 */
export async function writeMarketCharacter(sourceID, characterHash) {
  if (!characterHash) return;
  prunePastVersions();

  try {
    await set(characterKey(sourceID), characterHash);
  } catch {
    // A reader whose storage is blocked finds the character again next time,
    // which costs one walk and nothing else.
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
 * @param {string} sourceID
 * @param {number} nextTurnAt
 * @returns {Promise<void>}
 */
export async function deferMarket(sourceID, nextTurnAt) {
  prunePastVersions();
  await withinBudget(putTurnBack(sourceID, nextTurnAt), undefined);
}

async function putTurnBack(sourceID, nextTurnAt) {
  try {
    const held = await get(freshnessKey(sourceID));
    await set(freshnessKey(sourceID), {
      refreshedAt: held?.refreshedAt ?? 0,
      expiresAt: nextTurnAt,
    });
  } catch {
    // A market that cannot be deferred is tried again next probe, which is the
    // behaviour this avoids rather than one it has to guarantee.
  }
}

/**
 * When a market was last read, and when it is due again. Answers for a market
 * whose rows are no longer in memory, which is what makes a rotation one: the
 * cache lets an unwatched row go within minutes.
 *
 * @param {string} sourceID
 * @returns {Promise<{refreshedAt: number, expiresAt?: number}|undefined>}
 */
export async function readMarketFreshness(sourceID) {
  prunePastVersions();
  return withinBudget(freshnessHeld(sourceID), undefined);
}

async function freshnessHeld(sourceID) {
  try {
    const held = await get(freshnessKey(sourceID));
    return Number.isFinite(held?.refreshedAt) ? held : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Everything held for one market, replaced by what a fresh read says.
 *
 * **A type absent from the new set is removed.** A whole-market read is a
 * statement about every type on it, so a row it does not mention is one nobody
 * trades there any more — and nothing would ever refresh it away.
 *
 * **Its caller waits on this**, unlike the reads around it: a surface woken by
 * the market's clock moving reads through here, so it must find the new rows.
 *
 * @param {string} sourceID
 * @param {Map<string, object>|Array<[string, object]>} rows - Type id to row
 * @param {{refreshedAt: number, expiresAt?: number}} freshness - When the walk
 *   read these prices, and when they lapse
 * @returns {Promise<void>}
 */
export async function replaceStoredPrices(sourceID, rows, freshness) {
  prunePastVersions();
  await withinBudget(writeMarket(sourceID, rows, freshness), undefined);
}

async function writeMarket(sourceID, rows, freshness) {
  const arriving = new Map(rows);
  const prefix = marketPrefix(sourceID);

  try {
    const held = (await keys()).filter(
      (key) => typeof key === "string" && key.startsWith(prefix),
    );

    const gone = held.filter((key) => !arriving.has(key.slice(prefix.length)));
    if (gone.length) await delMany(gone);

    await Promise.all(
      [...arriving].map(([typeID, row]) =>
        set(entryKey(sourceID, typeID), withFreshness(row, freshness)),
      ),
    );

    // Last: written first, a write that gave out halfway would leave the market
    // saying it holds rows it does not.
    await set(freshnessKey(sourceID), withFreshness({}, freshness));
  } catch {
    // A reader whose storage is full or blocked prices from the network
    // instead, which is the tier working as designed.
  }
}

/** Lets a test run the once-per-session prune again. */
export function resetPriceStore() {
  pruning = null;
}
