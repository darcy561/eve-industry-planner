/**
 * What the last attempt to read a market settled on. Only a market read on the
 * device has one.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const MARKET_READ_OUTCOME = Object.freeze({
  /** Prices arrived. */
  READ: "read",
  /** Every character the account has was told no, which is an answer about the
   * market rather than a failure to reach it. */
  REFUSED: "refused",
  /** Nothing on the account could be asked, so nothing has been established
   * about the market at all. */
  UNASKABLE: "unaskable",
  /** The read did not settle, which says nothing about the market, and the next
   * turn may answer. */
  FAILED: "failed",
});

/**
 * Which outcome an error from a market read means, taken from the flags it
 * carries rather than its message, and a failure where it carries none.
 *
 * @param {{permanent?: boolean, needsReauthorisation?: boolean}} error
 * @returns {string} One of MARKET_READ_OUTCOME
 */
export function outcomeOfFailedRead(error) {
  if (error?.permanent) return MARKET_READ_OUTCOME.REFUSED;
  if (error?.needsReauthorisation) return MARKET_READ_OUTCOME.UNASKABLE;
  return MARKET_READ_OUTCOME.FAILED;
}

/**
 * Whether an outcome is one the reader can do something about. A failure is
 * not.
 *
 * @param {string|undefined} outcome - One of MARKET_READ_OUTCOME
 * @returns {boolean}
 */
export function readerCanAct(outcome) {
  return (
    outcome === MARKET_READ_OUTCOME.REFUSED ||
    outcome === MARKET_READ_OUTCOME.UNASKABLE
  );
}
