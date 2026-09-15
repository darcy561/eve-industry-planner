import { fetchMarketPricesQuery } from "../Endpoints/Public/marketPricesQuery";
import { deriveBookPrices } from "./deriveBookPrices";
import { ordersByRegionAndType } from "./fetchStationBook";
import { allMarketSources, SOURCE_KIND, sourceIn } from "./marketSources";
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
 * here, sorted by who can answer it, and issued as one request per transport.
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

  try {
    const { served, stations, adjusted, unaskable } = splitByTransport(batch);

    // Each transport answers on its own, and that is the point of the split. A
    // hub's price comes from this server and a saved station's book from ESI, so
    // one being unreachable says nothing about the other. Sent as one request
    // they were not independent at all: the server answers 400 for the whole
    // request when it sees a source it does not price, so a single station want
    // took every hub price batched beside it down with it.
    await Promise.all([
      serveServerHeld(served, adjusted),
      serveSavedStations(stations),
    ]);

    // A source no registry entry answers for cannot be asked of anything. It
    // settles as a failure rather than as nothing held, because "no order here"
    // is an answer and this is the absence of anywhere to ask — a reader whose
    // saved market has gone needs the difference.
    for (const want of unaskable) {
      rejectWant(want, new Error(`no market source named "${want.sourceID}"`));
    }
  } catch (error) {
    // Every want must settle. Each transport already fails only its own, so
    // reaching here means something outside them threw — reading the registry,
    // most likely, which stops being a static list the moment a reader's own
    // markets are stored in it. This runs from a timer, so an escaping
    // rejection would be reported nowhere and leave every cache entry in the
    // tick waiting for ever. Failing them all is worse than one transport
    // failing and better than silence.
    for (const waiters of batch.values()) {
      for (const waiter of waiters) waiter.reject(error);
    }
  }
}

/**
 * Sorts a tick's wants by who can answer them.
 *
 * The kind is read from the registry rather than from the want, so a caller
 * names a source and never learns what it is — `allMarketSources()` is the one
 * seam a reader-saved market joins at, and this reads whatever it carries.
 */
function splitByTransport(batch) {
  const sources = allMarketSources();
  const served = [];
  const stations = [];
  const adjusted = [];
  const unaskable = [];

  for (const [key, waiters] of batch) {
    const [head, typeID] = key.split("|");
    if (head === "adjusted") {
      adjusted.push({ typeID, waiters });
      continue;
    }

    const source = sourceIn(sources, head);
    const want = { typeID, sourceID: head, source, waiters };

    if (source?.kind === SOURCE_KIND.HUB) {
      served.push(want);
    } else if (source?.kind === SOURCE_KIND.STATION) {
      stations.push(want);
    } else {
      unaskable.push(want);
    }
  }

  return { served, stations, adjusted, unaskable };
}

/** The markets this server prices, asked for in one query. */
async function serveServerHeld(wants, adjusted) {
  if (wants.length === 0 && adjusted.length === 0) return;

  try {
    const answer = await fetchMarketPricesQuery({
      wants: wants.map(({ typeID, sourceID }) => ({ typeID, sourceID })),
      adjustedTypeIDs: adjusted.map(({ typeID }) => typeID),
    });

    // Before the waiters, so a reader woken by one of them sees the clock that
    // the rows it is about to read arrived with.
    recordClocks(answer);

    for (const want of wants) {
      resolveWant(want, rowFrom(answer.sources?.[want.sourceID], want.typeID));
    }
    for (const want of adjusted) {
      resolveWant(want, answer.adjusted?.prices?.[want.typeID] ?? null);
    }
  } catch (error) {
    for (const want of [...wants, ...adjusted]) rejectWant(want, error);
  }
}

/**
 * The markets the browser reads itself, one region-and-type book at a time.
 *
 * **A region's orders cover every station in it.** Two stations in one region
 * wanting the same type is one read of that book and two derivations from it,
 * not two reads — which is the whole reason the wants are grouped by the book
 * they need rather than by the station that asked.
 */
async function serveSavedStations(wants) {
  if (wants.length === 0) return;

  const books = new Map();
  for (const want of wants) {
    const bookKey = `${want.source.regionID}|${want.typeID}`;
    const held = books.get(bookKey);
    if (held) {
      held.wants.push(want);
    } else {
      books.set(bookKey, {
        regionID: want.source.regionID,
        typeID: want.typeID,
        wants: [want],
      });
    }
  }

  await Promise.all([...books.values()].map(readStationBook));
}

async function readStationBook({ regionID, typeID, wants }) {
  try {
    const book = await ordersByRegionAndType({ regionID, typeID });

    // The moment the browser read it. A hub's clock is the server saying when
    // it walked the book; nothing says that to a browser about ESI, so the read
    // is the only moment it can state honestly.
    const refreshedAt = Date.now();

    for (const want of wants) {
      const prices = deriveBookPrices(book.orders, want.source.stationID);
      resolveWant(want, pricedOrNothing(prices, refreshedAt, book.expiresAt));
    }
  } catch (error) {
    for (const want of wants) rejectWant(want, error);
  }
}

/**
 * Nothing on either side of the book is the station holding no order for the
 * type — the same answer a hub gives by leaving the row out, rather than a
 * price of zero.
 *
 * The row carries the expiry ESI gave its book, because this row can outlive the
 * tab: the tier beneath the cache refuses to serve one whose book would have
 * changed by the time it is read back. A hub row carries none, and needs none —
 * it is asked for again on every reload.
 */
function pricedOrNothing(prices, refreshedAt, expiresAt) {
  if (!prices.buy && !prices.sell) return null;

  const row = { ...prices, refreshedAt };
  if (Number.isFinite(expiresAt)) row.expiresAt = expiresAt;
  return row;
}

function resolveWant(want, value) {
  for (const waiter of want.waiters) waiter.resolve(value);
}

function rejectWant(want, error) {
  for (const waiter of want.waiters) waiter.reject(error);
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
 * What the answer held for one want.
 *
 * A want the answer says nothing about settles as null rather than throwing: a
 * market holding no order for a type is an answer, not a failure, and retrying
 * it would ask forever.
 */
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
