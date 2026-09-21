/**
 * What an ESI industry run linked to a job says about itself, as functions of
 * the row rather than getters on an instance.
 *
 * ESI's own field names are kept — `status`, `start_date`, `end_date` — because
 * that is what the row stores and what the backend reads.
 */

/** @param {object} run @returns {boolean} */
export function isActive(run) {
  return run?.status === "active";
}

/** @param {object} run @returns {boolean} */
export function isDelivered(run) {
  return run?.status === "delivered";
}

/**
 * When the runs finish, in milliseconds, or `null` without an end date.
 *
 * @param {object} run
 * @returns {number|null}
 */
export function finishesAt(run) {
  const parsed = Date.parse(run?.end_date);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Whether the run has had its time and is waiting to be delivered.
 *
 * The moment is the caller's to give where it has one: a panel that ticks a
 * clock asks against the tick it is drawing, so the bar and the words beside it
 * cannot disagree about whether the run is over.
 *
 * @param {object} run
 * @param {number} [now]
 * @returns {boolean}
 */
export function isReadyToDeliver(run, now = Date.now()) {
  const finishes = finishesAt(run);
  return isActive(run) && finishes !== null && finishes <= now;
}

/**
 * How far through its run the job is, as a percentage.
 *
 * A run that has finished or been delivered is complete however its dates read;
 * one whose dates cannot say has made no progress rather than an imagined
 * amount.
 *
 * @param {object} run
 * @param {number} [now]
 * @returns {number}
 */
export function progressPercent(run, now = Date.now()) {
  if (isDelivered(run) || isReadyToDeliver(run, now)) return 100;

  const finishes = finishesAt(run);
  const starts = Date.parse(run?.start_date);
  if (finishes === null || Number.isNaN(starts) || finishes <= starts) {
    return 0;
  }

  const wholeRun = finishes - starts;
  const left = Math.min(Math.max(finishes - now, 0), wholeRun);
  return 100 - (left / wholeRun) * 100;
}
