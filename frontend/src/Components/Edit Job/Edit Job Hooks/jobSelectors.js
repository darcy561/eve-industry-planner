/**
 * Figures read off a job, as functions of the document rather than getters on an
 * instance.
 *
 * A selector takes the job as plain data and returns what it derives, so a panel
 * can read one from a draft without a class being built around it. Each reads
 * only the part of the job it names, which is what lets a reader subscribe to
 * that part rather than to the whole job.
 */

/**
 * The setup the reader has open.
 *
 * @param {object} job
 * @returns {object|undefined} The setup row, or undefined where none is open
 */
export function selectedSetup(job) {
  return job?.build?.setup?.[job?.layout?.setupToEdit];
}

/**
 * The setup another one should continue from: the one open, or the first.
 *
 * A job always builds from something, so a new setup copies what is already
 * there rather than starting from the player's defaults — the reader has
 * usually already said how this job is made.
 *
 * @param {object} job
 * @returns {object|undefined}
 */
export function setupToBuildFrom(job) {
  return selectedSetup(job) ?? Object.values(job?.build?.setup ?? {})[0];
}
