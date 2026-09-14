import { fetchMarketPricesQuery } from "../Endpoints/Public/marketPricesQuery";
import { recordAdjustedClock, recordSourceClock } from "./sourceClocks";

/**
 * What a tick has been asked for, and everyone waiting on each want.
 *
 * Keyed `sourceID|typeID` for a price and `adjusted|typeID` for an adjusted
 * price, so two callers wanting the same thing in the same tick wait on one
 * lookup rather than issuing two.
 *
 * @type {Map<string, {resolve: Function, reject: Function}[]>}
 */
const pending = new Map();
let flushScheduled = false;

const priceKey = (sourceID, typeID) => `${sourceID}|${typeID}`;
const adjustedKey = (typeID) => `adjusted|${typeID}`;

/**
 * Asks for one type's price at one market, batched with whatever else is asked
 * for in the same tick.
 *
 * The cache above this is keyed by type and source, which is what makes two
 * panels wanting the same material one entry rather than two — but an entry per
 * want would be a request per want. Everything raised in one tick is collected
 * here and issued as a single query naming every market and every type it saw.
 *
 * @param {number|string} typeID
 * @param {string} sourceID - A market source id
 * @returns {Promise<{buy: number, sell: number, buyP95: number, sellP05: number,
 *   refreshedAt: number}|null>} null where the market holds no order for the type
 */
export function requestPrice(typeID, sourceID) {
  return enqueue(priceKey(sourceID, typeID));
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
      // A macrotask rather than a microtask: React renders every panel wanting
      // prices before yielding, and a microtask would flush after the first.
      setTimeout(flush, 0);
    }
  });
}

async function flush() {
  const batch = new Map(pending);
  pending.clear();
  flushScheduled = false;
  if (batch.size === 0) return;

  // The keys are already the pairs, so the request is exactly what the tick
  // asked for. Collecting the markets and the types into two flat lists instead
  // would ask every market for every type the tick mentioned — a job pricing
  // half its materials at one market and half at another would fetch both halves
  // at both, which is the cost this whole stage exists to remove.
  const wants = [];
  const adjustedTypeIDs = [];

  for (const key of batch.keys()) {
    const [head, typeID] = key.split("|");
    if (head === "adjusted") {
      adjustedTypeIDs.push(typeID);
    } else {
      wants.push({ typeID, sourceID: head });
    }
  }

  try {
    const answer = await fetchMarketPricesQuery({ wants, adjustedTypeIDs });
    // Before the waiters, so a reader woken by one of them sees the clock that
    // the rows it is about to read arrived with.
    recordClocks(answer);
    settle(batch, answer);
  } catch (error) {
    for (const waiters of batch.values()) {
      for (const waiter of waiters) waiter.reject(error);
    }
  }
}

/**
 * Records every clock an answer carried, and reports the markets whose books
 * have been walked again since the rows held for them arrived.
 *
 * Every answer is a clock reading, whatever it was asked for — which is why
 * nothing polls for one. A market named in a request reports its clock in the
 * reply, so a request made to read one type's price also settles whether every
 * other row held for that market is still good.
 *
 * @param {import("../Endpoints/Public/marketPricesQuery").MarketPricesQueryResult} answer
 * @returns {{sources: string[], adjusted: boolean}} Markets that moved, and
 *   whether the adjusted block did
 */
function recordClocks(answer) {
  const moved = [];

  for (const [sourceID, block] of Object.entries(answer?.sources ?? {})) {
    if (recordSourceClock(sourceID, block?.refreshedAt)) moved.push(sourceID);
  }

  const adjustedMoved = answer?.adjusted
    ? recordAdjustedClock(answer.adjusted.refreshedAt)
    : false;

  if (moved.length > 0 || adjustedMoved) {
    onClocksMoved?.({ sources: moved, adjusted: adjustedMoved });
  }

  return { sources: moved, adjusted: adjustedMoved };
}

/** @type {((moved: {sources: string[], adjusted: boolean}) => void)|null} */
let onClocksMoved = null;

/**
 * Sets what to tell when a market's book has been walked again.
 *
 * The cache holds the rows a moved clock makes stale, and the loader is what
 * learns the clock moved — so the loader announces and the cache acts, rather
 * than the loader reaching up into the cache it sits beneath.
 *
 * @param {((moved: {sources: string[], adjusted: boolean}) => void)|null} listener
 */
export function setClockMovedListener(listener) {
  onClocksMoved = listener;
}

/**
 * Hands each waiter what the answer held for it.
 *
 * A want the answer says nothing about settles as null rather than throwing: a
 * market holding no order for a type is an answer, not a failure, and retrying
 * it would ask forever.
 */
function settle(batch, answer) {
  for (const [key, waiters] of batch) {
    const [head, typeID] = key.split("|");

    const value =
      head === "adjusted"
        ? (answer.adjusted?.prices?.[typeID] ?? null)
        : rowFrom(answer.sources?.[head], typeID);

    for (const waiter of waiters) waiter.resolve(value);
  }
}

function rowFrom(block, typeID) {
  const row = block?.prices?.[typeID];
  if (!row) return null;
  return { ...row, refreshedAt: block.refreshedAt ?? 0 };
}

/**
 * Forgets a tick's pending wants. For tests.
 *
 * The clock listener is deliberately left in place: the cache registers it once
 * when it is first imported and has no way to do so again, so clearing it here
 * would leave every later test in the file running without the rule it is
 * trying to exercise.
 */
export function resetPriceLoader() {
  pending.clear();
  flushScheduled = false;
}
