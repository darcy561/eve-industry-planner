import useUsersStore from "../../Zustand/usersStore.js";
import { getJobInstallCostForPlanning } from "../Installation Costs/installCosts.js";
import { readMarketPriceForType } from "../MarketData/prices/marketPriceForType.js";
import { materialCostThroughChildJobs } from "./childJobCostWalk.js";

/**
 * What a material is likely to cost, counting a linked child job as the way it
 * will be obtained and the market as the way everything else will be.
 *
 * This is the estimate the planner prices a build from before any of it has
 * been bought. Its counterpart, `jobCostSoFar`, answers what has actually been
 * spent and so never reaches for a market figure.
 *
 * @param {object} inputMaterial
 * @param {string[]} childJobs - The child jobs building this material, if any
 * @param {object|object[]} [alternativeJobLocation] - Speculative jobs not yet in the planner
 * @param {string} marketLocation - The market the caller resolved for its side
 * @param {string} orderType - The order type the caller resolved for its side
 * @returns {number}
 */
export function estimatedMaterialCost(
  inputMaterial,
  childJobs,
  alternativeJobLocation = [],
  marketLocation,
  orderType,
) {
  const jobArray = useUsersStore.getState().jobData.jobArray || [];
  const alternatives = Array.isArray(alternativeJobLocation)
    ? alternativeJobLocation
    : [alternativeJobLocation];

  const jobsByID = new Map();
  for (const job of [...jobArray, ...alternatives]) {
    if (job?.jobID != null && !jobsByID.has(job.jobID)) {
      jobsByID.set(job.jobID, job);
    }
  }

  return materialCostThroughChildJobs(
    inputMaterial,
    childJobs,
    {
      findJob: (jobID) => jobsByID.get(jobID),
      // Nothing was fetched at this market where it holds no row, so falling
      // back to what the reader already paid beats pricing the line at nothing.
      buyCost: (material) =>
        (readMarketPriceForType(material.typeID, marketLocation, orderType) ||
          material.purchasedCost) * material.quantity,
      installCost: getJobInstallCostForPlanning,
    },
    new Set(),
  );
}
