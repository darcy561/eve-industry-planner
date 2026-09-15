import { del, delMany, get, keys, set } from "idb-keyval";

/**
 * What a reader's own markets are worth keeping between visits.
 *
 * This is the tier beneath the price cache, and only reader-saved sources reach
 * it — the hubs this server walks are cheap to ask for again and are held for
 * the session alone. A station's book was read at the reader's expense and a
 * citadel's was walked whole with their own token, so losing them on a reload
 * means paying for them again.
 *
 * **It sits beneath the cache rather than beside it.** A miss falls through to
 * here before reaching the network, and a resolve writes both. The alternative
 * examined — dumping the query cache to disk on change — needed every price held
 * in memory long enough to be written, hub rows included, which is the opposite
 * of what the two tiers are for.
 *
 * **Nothing here may break pricing.** IndexedDB is absent in some browsing modes
 * and blocked in others, so every call answers as a miss rather than throwing: a
 * reader with no storage still gets prices, they are simply fetched again.
 *
 * **Including when it neither succeeds nor fails.** A store request can hang:
 * `idb-keyval` settles on `success`, `error` and `abort`, and an open request
 * that fires `blocked` instead — another tab holding the database through a
 * version change — fires none of them. WebKit has its own way of getting there,
 * which the library comments on in `createStore`: it closes the connection and
 * is merely hoped to say so. A hang is worse than a failure here, because
 * nothing above would report anything at all — the price would simply never
 * arrive. So every call is bounded, and a store that does not answer in time is
 * a miss like any other.
 */

/**
 * How long anything waits on storage before deciding it is not going to answer.
 *
 * Generous against a slow disk and short against a reader watching a figure that
 * has not appeared: the cost of being wrong is one avoidable fetch.
 */
const STORAGE_BUDGET_MS = 2000;

/**
 * The work, or the fallback if storage does not answer in time.
 *
 * The abandoned promise is left pending on purpose — there is nothing to cancel,
 * an IndexedDB request having no abort that helps here, and it settling later
 * harms nothing because its answer is no longer wanted.
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

/** @type {Promise<void>|null} */
let pruning = null;

/**
 * Clears out rows written under an earlier row shape.
 *
 * Bumping the version abandons the old rows by changing the key they are
 * addressed under, but abandoning is not removing: nothing reads them again, so
 * the per-row eviction below can never reach them and they would sit on the
 * reader's device for good.
 *
 * Once per session, on the first touch of the store, and not awaited — it
 * competes with nothing, because the keys it removes are by definition ones
 * nothing is going to ask for.
 */
function prunePastVersions() {
  pruning ??= (async () => {
    try {
      const abandoned = (await keys()).filter(
        (key) =>
          typeof key === "string" &&
          key.startsWith(PREFIX) &&
          !key.startsWith(CURRENT_PREFIX),
      );

      if (abandoned.length > 0) await delMany(abandoned);
    } catch {
      // Storage that cannot be read holds nothing worth pruning either.
    }
  })();

  return pruning;
}

/**
 * A row held for one type at one reader-saved market, if one is still good.
 *
 * **An expired row is dropped as it is found**, which is the whole of the
 * eviction path: a row is only ever read when something wants that exact type at
 * that exact market, so the moment a reader stops pricing something is the
 * moment its row stops being visited — and a row nothing visits is one nothing
 * is paying for. Sweeping the store on a timer would spend work to find that out.
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

    // A row whose book ESI said would have changed by now is not a price any
    // more. Serving it would be worse than having stored nothing, because
    // nothing above this would ever ask again.
    if (Number.isFinite(row.expiresAt) && row.expiresAt <= now) {
      await del(key);
      return undefined;
    }

    return row;
  } catch {
    return undefined;
  }
}

/**
 * Keeps a row for one type at one reader-saved market.
 *
 * @param {string} sourceID
 * @param {number|string} typeID
 * @param {object} row - As the loader resolved it, carrying its own
 *   `refreshedAt` and, where the source states one, its `expiresAt`
 * @returns {Promise<void>}
 */
export async function writeStoredPrice(sourceID, typeID, row) {
  if (!row) return;
  prunePastVersions();

  try {
    await set(entryKey(sourceID, typeID), row);
  } catch {
    // A reader whose storage is full or blocked prices from the network every
    // time, which is the tier working as designed rather than a failure worth
    // reporting to them.
  }
}

/** Lets a test run the once-per-session prune again. */
export function resetPriceStore() {
  pruning = null;
}
