import { fetchPrices } from "../MarketData/priceCache";
import { pricesWantedBy } from "../MarketData/pricesWanted";
import getSystemIndexes from "../System Indexes/findSystemIndex";

/**
 * Fetches what a job needs priced and what its setups cost to install.
 *
 * Prices resolve into the cache rather than being returned: a caller reads them
 * through `getMarketPriceForType` once this settles, so there is no interval in
 * which the caller holds figures the readers cannot see.
 *
 * Each material is asked for at the market it is actually priced against, which
 * is per material — an override, a market group, or the job's own choice can each
 * name one.
 *
 * @param {Object|Array<Object>} inputJobs - Job object(s) to get missing data for
 * @returns {Promise<{requestedSystemIndexes: Object}>}
 * @throws {Error} Throws error if inputJobs is missing
 */
async function getMissingESIData(inputJobs) {
  if (!inputJobs) {
    throw new Error("Missing Job Objects");
  }

  const jobsAsArray = Array.isArray(inputJobs) ? inputJobs : [inputJobs];

  let requiredSystemIndexes = new Set();
  for (const job of jobsAsArray) {
    requiredSystemIndexes = new Set([
      ...requiredSystemIndexes,
      ...job.setupSystemIDs,
    ]);
  }

  const { wants, adjustedTypeIDs } = pricesWantedBy(jobsAsArray);

  const pricesSettled = fetchPrices({ wants, adjustedTypeIDs });
  const requestedSystemIndexes = await getSystemIndexes(requiredSystemIndexes);
  await pricesSettled;

  return { requestedSystemIndexes };
}

export default getMissingESIData;
