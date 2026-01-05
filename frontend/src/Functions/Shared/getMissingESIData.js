import getMarketData from "../MarketData/findMarketData";
import getSystemIndexes from "../System Indexes/findSystemIndex";

/**
 * Retrieves missing ESI data (market data and system indexes) for a collection of jobs.
 * Collects all required material IDs and system IDs from jobs and fetches the data.
 * 
 * @param {Object|Array<Object>} inputJobs - Job object(s) to get missing data for
 * @returns {Promise<Object>} Promise that resolves to object with market data and system indexes
 * 
 * @throws {Error} Throws error if inputJobs is missing
 * 
 * @example
 * const missingData = await getMissingESIData(jobArray);
 * console.log(missingData.requestedMarketData);
 * console.log(missingData.requestedSystemIndexes);
 */
async function getMissingESIData(inputJobs) {
  if (!inputJobs) {
    throw new Error("Missing Job Objects");
  }

  const jobsAsArray = Array.isArray(inputJobs) ? inputJobs : [inputJobs];

  let requiredMarketData = new Set();
  let requiredSystemIndexes = new Set();

  for (let job of jobsAsArray) {
    requiredMarketData = new Set([
      ...requiredMarketData,
      ...job.getMaterialIDs(),
    ]);
    requiredSystemIndexes = new Set([
      ...requiredSystemIndexes,
      ...job.getSystemIndexes(),
    ]);
  }

  const requestedMarketDataPromise = getMarketData(requiredMarketData);
  const requestedSystemIndexesPromise = getSystemIndexes(requiredSystemIndexes);

  const requestedSystemIndexes = await requestedSystemIndexesPromise;
  const requestedMarketData = await requestedMarketDataPromise;

  return { requestedMarketData, requestedSystemIndexes };
}

export default getMissingESIData;
