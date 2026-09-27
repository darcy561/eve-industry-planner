import useUsersStore from "../../Zustand/usersStore.js";
import { getJobInstallCostForPlanning } from "../Installation Costs/installCosts.js";
import { readMarketPriceForType } from "../MarketData/prices/marketPriceForType.js";
import { materialCostThroughChildJobs } from "./childJobCostWalk.js";
import { purchasedCost } from "../../Components/Edit Job/Edit Job Hooks/materialSelectors.js";

/**
 * What a material is likely to cost, counting a linked child job as the way it
 * will be obtained and the market as the way everything else will be.
 *
 * @param {object} inputMaterial
 * @param {number} requirement - How many of it the owning job's setups call for
 * @param {string[]} childJobs - The child jobs building this material, if any
 * @param {object|object[]} [alternativeJobLocation] - Speculative jobs not yet in the planner
 * @param {string} marketLocation - The market the caller resolved for its side
 * @param {string} orderType - The order type the caller resolved for its side
 * @returns {number}
 */
export function estimatedMaterialCost(
  inputMaterial,
  requirement,
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
    requirement,
    childJobs,
    {
      findJob: (jobID) => jobsByID.get(jobID),
      buyCost: (material, need) =>
        (readMarketPriceForType(material.typeID, marketLocation, orderType) ||
          purchasedCost(material, need)) * need,
      installCost: getJobInstallCostForPlanning,
    },
    new Set(),
  );
}
