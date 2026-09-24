/**
 * What the last attempt to read a market settled on.
 *
 * A market the reader reads for themselves can fail for reasons only they can
 * fix, and the figures not arriving looks the same either way: no prices, and a
 * panel that can only say nobody has read it yet. So the reason is kept, and it
 * is kept beside the market's freshness because it is the same fact — how the
 * last turn went.
 *
 * Only a market read on the device has one. A market this server prices answers
 * for every reader at once, and the server's own failures are not the reader's
 * to see here.
 */

/**
 * @type {Readonly<Record<string, string>>}
 */
export const MARKET_READ_OUTCOME = Object.freeze({
  /** Prices arrived. */
  READ: "read",
  /**
   * Every character the account has was told no.
   *
   * An answer about the market rather than a failure to reach it: asking again
   * says the same thing until the account gains a character that can dock.
   */
  REFUSED: "refused",
  /**
   * Nothing on the account could be asked — no character holds the scope, or
   * there are no characters to ask.
   *
   * Distinct from a refusal because nothing has been established about the
   * market at all: the account has not been told it cannot see this one, only
   * that it has nobody to ask with.
   */
  UNASKABLE: "unaskable",
  /**
   * The read did not settle — ESI was down, refused for rate, or the token
   * could not be acquired.
   *
   * Says nothing about the market, and the next turn may answer.
   */
  FAILED: "failed",
});

/**
 * Which outcome an error from a market read means.
 *
 * Reads the flags the error already carries rather than its message: a refusal
 * is marked permanent because asking again is waste, and a character that was
 * never granted the scope is marked as needing re-authorisation. Anything else
 * is a failure, which is the safe reading — a market called unreachable on a bad
 * connection would tell a reader to go and fix something that is not broken.
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
 * Whether an outcome is one the reader can do something about.
 *
 * A failure is not: it is the app's problem or ESI's, and the next turn may
 * answer without the reader having done anything.
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
