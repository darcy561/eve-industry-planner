import { trace } from "firebase/performance";
import { performance } from "../../firebase";
import fetchMarketPrices from "../Endpoints/Public/marketPrices";

/**
 * Splits a large array of item IDs into smaller chunks for efficient API requests.
 * Creates Firebase performance traces and returns an array of promises for parallel processing.
 * 
 * @param {Array<string|number>} requestArray - Array of item IDs to request market data for
 * @returns {Array<Promise>} Array of promises for market data requests
 * 
 * @example
 * const itemIDs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
 * const promises = splitMarketDataRequestIntoChuncks(itemIDs);
 * const results = await Promise.allSettled(promises);
 */
function splitMarketDataRequestIntoChuncks(requestArray) {
  const MAX_CHUNK_SIZE = 500;
  const promises = [];
  const firebaseTrace = trace(performance, "GetItemPrices");

  if (!requestArray || requestArray.length === 0) return promises;

  firebaseTrace.start();

  for (let x = 0; x < requestArray.length; x += MAX_CHUNK_SIZE) {
    const chunk = requestArray.slice(x, x + MAX_CHUNK_SIZE);
    promises.push(fetchMarketPrices(chunk));
  }

  firebaseTrace.stop();
  return promises;
}

export default splitMarketDataRequestIntoChuncks;
