import fetchMarketPrices from "../Endpoints/Public/marketPrices";

/**
 * Returns a single promise that loads all prices; chunking is handled inside
 * {@link fetchMarketPrices} via `fetchWithPublicHeaders` batching (≤500 type IDs per HTTP request).
 *
 * @param {Array<string|number>} requestArray - Item type IDs to request market data for
 * @returns {Array<Promise<object>>} One-element array for callers that merge with `Promise.all`
 */
function splitMarketDataRequestIntoChuncks(requestArray) {
  if (!requestArray || requestArray.length === 0) return [];
  return [fetchMarketPrices(requestArray)];
}

export default splitMarketDataRequestIntoChuncks;
