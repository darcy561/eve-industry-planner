import { fetchMarketPricesQuery } from "../Endpoints/Public/marketPricesQuery";
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
    const { served, adjusted, unaskable } = splitByTransport(batch);

    await serveServerHeld(served, adjusted);

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

    if (
      source?.kind === SOURCE_KIND.HUB ||
      source?.kind === SOURCE_KIND.STATION
    ) {
      served.push(want);
    } else {
      unaskable.push(want);
    }
  }

  return { served, adjusted, unaskable };
}

/**
 * What a source is called on the wire.
 *
 * A hub is named by its id and a saved station by the station it sits at: this
 * server prices a market an account registered, and a station id is what it was
 * registered by. The reader's own id for that market never leaves here — every
 * row, key and clock is still held under it.
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
        sourceID: transportIDFor(source),
      })),
      adjustedTypeIDs: adjusted.map(({ typeID }) => typeID),
    });

    // Before the waiters, so a reader woken by one of them sees the clock that
    // the rows it is about to read arrived with.
    recordClocks(answer, wants);

    for (const want of wants) {
      const block = answer.sources?.[transportIDFor(want.source)];
      resolveWant(want, rowFrom(block, want.typeID));
    }
    for (const want of adjusted) {
      resolveWant(want, answer.adjusted?.prices?.[want.typeID] ?? null);
    }
  } catch (error) {
    for (const want of [...wants, ...adjusted]) rejectWant(want, error);
  }
}

function resolveWant(want, value) {
  for (const waiter of want.waiters) waiter.resolve(value);
}

function rejectWant(want, error) {
  for (const waiter of want.waiters) waiter.reject(error);
}

/**
 * Records every clock an answer carried, and reports the markets walked again
 * since the rows held for them arrived.
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
function recordClocks(answer, wants) {
  const moved = [];

  // Recorded per want rather than per answer block, because two markets an
  // account saved can sit at one station and are asked for under the same id:
  // keyed by what was asked, one would take the other's clock and the market
  // that lost it would serve a superseded price until the tab closed.
  const asked = new Set();
  const answered = new Set();
  for (const want of wants ?? []) {
    answered.add(transportIDFor(want.source));
    if (asked.has(want.sourceID)) continue;
    asked.add(want.sourceID);

    const block = answer?.sources?.[transportIDFor(want.source)];
    if (recordSourceClock(want.sourceID, block?.refreshedAt)) {
      moved.push(want.sourceID);
    }
  }

  // A market the answer named that nothing asked for still states its clock,
  // under the only id there is for it here.
  for (const [sourceID, block] of Object.entries(answer?.sources ?? {})) {
    if (answered.has(sourceID)) continue;
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
 * Sets what to tell when a market has been walked again.
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
