/**
 * Stable id for “which document” a lock applies to (collection + doc id).
 * Uses a delimiter that cannot appear in Mongo collection names or our doc ids.
 */
const SEP = "\x1e";

/**
 * @param {string} collection - Mongo logical collection (e.g. `user_job_groups`, `jobs`)
 * @param {string} docID
 * @returns {string}
 */
export function documentLockKey(collection, docID) {
  return `${collection}${SEP}${docID}`;
}

/**
 * @param {string} key - from {@link documentLockKey}
 * @returns {{ collection: string, docID: string }|null}
 */
export function parseDocumentLockKey(key) {
  if (typeof key !== "string" || !key.includes(SEP)) return null;
  const i = key.indexOf(SEP);
  const collection = key.slice(0, i);
  const docID = key.slice(i + SEP.length);
  if (!collection || !docID) return null;
  return { collection, docID };
}
