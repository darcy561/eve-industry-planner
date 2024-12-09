import getMarketData from "../MarketData/findMarketData";
import getSystemIndexes from "../System Indexes/findSystemIndex";

async function getMissingESIData(
  inputJobs,
  evePricesObject = {},
  systemIndexesObject = {}
) {
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

  const requestedMarketDataPromise = getMarketData(
    requiredMarketData,
    evePricesObject
  );
  const requestedSystemIndexesPromise = getSystemIndexes(
    requiredSystemIndexes,
    systemIndexesObject
  );

  const requestedSystemIndexes = await requestedSystemIndexesPromise;
  const requestedMarketData = await requestedMarketDataPromise;

  return { requestedMarketData, requestedSystemIndexes };
}

export default getMissingESIData;
