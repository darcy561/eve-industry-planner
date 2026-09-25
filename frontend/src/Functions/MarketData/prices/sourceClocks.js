/**
 * The moment each market's orders were last walked, as the rows held for it say.
 *
 * A market refreshes as a whole, so every row it answered with shares one
 * moment and goes stale together. That makes the market's own clock the
 * staleness rule: a held row is current for exactly as long as the clock it
 * arrived with is the newest one that market has published, however long ago
 * that was.
 *
 * A clock arrives beside the rows in every price answer, so this is written from
 * whatever the last request happened to ask about rather than from a reading of
 * its own.
 *
 * Adjusted prices belong to no market and carry their own clock, recorded here
 * under a key of their own so the same comparison serves both.
 */

/** @type {Map<string, number>} */
const clocks = new Map();

/** Adjusted prices are source-independent, so they need a key nothing can be. */
const ADJUSTED = " adjusted";

/**
 * The newest clock recorded for a market, or undefined where none is held.
 *
 * @param {string} marketLocation
 * @returns {number|undefined}
 */
export function readSourceClock(marketLocation) {
  return clocks.get(marketLocation);
}

/** @returns {number|undefined} */
export function readAdjustedClock() {
  return clocks.get(ADJUSTED);
}

/**
 * Records a market's clock, and says whether it moved past what was held.
 *
 * An older clock is ignored rather than written: answers from two chunks of one
 * request can settle in either order, and a market never walks backwards.
 *
 * @param {string} marketLocation
 * @param {number} refreshedAt - Milliseconds, as the price answer carries it
 * @returns {boolean} true where this is a newer walk than the one held, which
 *   is what makes every row from the older one stale
 */
export function recordSourceClock(marketLocation, refreshedAt) {
  return record(marketLocation, refreshedAt);
}

/** @param {number} refreshedAt @returns {boolean} */
export function recordAdjustedClock(refreshedAt) {
  return record(ADJUSTED, refreshedAt);
}

function record(key, refreshedAt) {
  if (!Number.isFinite(refreshedAt) || refreshedAt <= 0) return false;

  const held = clocks.get(key);
  if (held !== undefined && refreshedAt <= held) return false;

  clocks.set(key, refreshedAt);

  // A first clock is recorded but is not a move: the rows arriving with it are
  // current as of it, and calling it a move would discard what was just handed
  // over. Only a clock replacing an older one makes anything stale.
  return held !== undefined;
}

/** Forgets every clock. For tests. */
export function resetSourceClocks() {
  clocks.clear();
}
