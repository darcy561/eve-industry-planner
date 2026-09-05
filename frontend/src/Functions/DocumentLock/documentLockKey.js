/**
 * Stable id for “which document” a lock applies to (collection + doc id).
 * Uses a delimiter that cannot appear in Mongo collection names or our doc ids.
 */
const SEP = "\x1e";

/**
 * @param {string} collection - Mongo logical collection (e.g. `job_groups`, `jobs`)
 * @param {string} docID
 * @returns {string}
 */
export function documentLockKey(collection, docID) {
  return `${collection}${SEP}${docID}`;
}
