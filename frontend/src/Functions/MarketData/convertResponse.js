/**
 * Converts an array of market data responses into a single object with typeID as keys.
 * Filters out rejected promises and processes only fulfilled responses.
 * 
 * @param {Array<PromiseSettledResult>} responseArray - Array of settled promise results from market data requests
 * @returns {Object} Object with typeID as keys and market data objects as values
 * 
 * @example
 * const responses = await Promise.allSettled(marketRequests);
 * const marketData = convertMarketDataResponseToObject(responses);
 * console.log(marketData[34].price); // Access price for typeID 34
 */
function convertMarketDataResponseToObject(responseArray) {
  let responseObject = {};

  for (let data of responseArray) {
    if (data.status !== "fulfilled") continue;

    responseObject = { ...responseObject, ...data.value };
  }
  return responseObject;
}

export default convertMarketDataResponseToObject;
