import { totalQuantityProduced } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { estimatedMaterialCost } from "./estimatedMaterialCost.js";
import { getJobInstallCostForPlanning } from "../Installation Costs/installCosts.js";

/**
 * @typedef {object} ChildJobTotals
 * @property {number} totalCostOfMaterials
 * @property {number} totalInstallCosts
 * @property {number} quantityProduced
 * @property {number} totalCostPerItem
 */

/**
 * What a child job would cost to run, and what that makes each unit it produces.
 *
 * Read wherever a build is being compared against buying, so the figure a player
 * is shown is the same one wherever they are shown it.
 *
 * @param {object} childJob - The job being costed, real or speculative
 * @param {object} temporaryChildJobs - Speculative jobs by material type id
 * @param {string} marketLocation
 * @param {string} orderType
 * @returns {ChildJobTotals}
 */
export function calculateChildJobTotals(
  childJob,
  temporaryChildJobs = {},
  marketLocation,
  orderType,
) {
  const totalCostOfMaterials = Object.values(
    childJob?.build?.materials ?? {},
  ).reduce(
    (total, material) =>
      total +
      estimatedMaterialCost(
        material,
        childJob.build.childJobs[material.typeID],
        temporaryChildJobs[material.typeID],
        marketLocation,
        orderType,
      ),
    0,
  );

  const totalInstallCosts = getJobInstallCostForPlanning(childJob);
  const quantityProduced = totalQuantityProduced(childJob);

  return {
    totalCostOfMaterials,
    totalInstallCosts,
    quantityProduced,
    // A job producing nothing has no per-unit cost. Dividing anyway would give
    // an infinite one and colour every comparison against it.
    totalCostPerItem:
      quantityProduced !== 0
        ? (totalCostOfMaterials + totalInstallCosts) / quantityProduced
        : 0,
  };
}
