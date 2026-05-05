import fetchSystemIndexes from "../Endpoints/Public/systemIndexes";

/**
 * Returns a single promise that loads all system indexes; chunking is handled inside
 * {@link fetchSystemIndexes} via `fetchWithPublicHeaders` batching (≤500 IDs per HTTP request).
 *
 * @param {Array<number>} requestArray - Array of system IDs to request system indexes for
 * @returns {Array<Promise<object>>} One-element array for callers that merge with `Promise.all`
 */
export default function splitSystemIndexesRequestIntoChuncks(requestArray) {
  if (!requestArray || requestArray.length === 0) return [];
  return [fetchSystemIndexes(requestArray)];
}
