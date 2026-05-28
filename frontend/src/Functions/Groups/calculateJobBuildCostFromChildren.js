import useUsersStore from "../../Zustand/usersStore.js";
import {
  getJobActualInstallCost,
  getJobInstallCostForPlanning,
} from "../Installation Costs/installCosts.js";

/** @param {unknown} n @param {number} [fallback=0] */
function toFinite(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Per-unit or total line contribution from a material, walking linked child jobs.
 * Falls back to purchased cost when the ratio (cost ÷ child output) is undefined
 * (missing jobs, or zero output quantity).
 *
 * @param {import("../../Classes/job").default} outputJob
 * @param {{ installCostMode?: "actual" | "planning" }} [options]
 *   - `actual` — group output / ESI totals only (no setup estimates)
 *   - `planning` — actual when set, else setup estimates (edit job material pricing)
 */
export function calculateCurrentJobBuildCostFromChildren(
  outputJob,
  options = {}
) {
  if (!outputJob?.build) {
    return 0;
  }

  const getInstallCost =
    options.installCostMode === "actual"
      ? getJobActualInstallCost
      : getJobInstallCostForPlanning;

  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;
  const products = outputJob.build.products;
  const outTotalQty = toFinite(products?.totalQuantity);
  if (outTotalQty <= 0) {
    return 0;
  }

  const costs = outputJob.build.costs;
  let finalBuildCost =
    getInstallCost(outputJob) + toFinite(costs?.extrasTotal);

  for (const material of outputJob.build.materials ?? []) {
    const childJobs = outputJob.build.childJobs?.[material.typeID];
    finalBuildCost += findItemBuildCost(
      material,
      childJobs,
      findJobInJobArray,
      getInstallCost
    );
  }

  return toFinite(finalBuildCost) / outTotalQty;
}

/**
 * @param {*} material
 * @param {unknown} inputChildJobs
 * @param {(id: string) => import("../../Classes/job").default | null | undefined} findJobInJobArray
 * @param {(job: import("../../Classes/job").default) => number} getInstallCost
 */
function findItemBuildCost(
  material,
  inputChildJobs,
  findJobInJobArray,
  getInstallCost
) {
  const childIds = Array.isArray(inputChildJobs) ? inputChildJobs : [];

  if (material.purchaseComplete || childIds.length === 0) {
    return toFinite(material.purchasedCost);
  }

  let returnTotal = 0;
  let totalProduced = 0;

  for (const childJobID of childIds) {
    const childJob = findJobInJobArray(childJobID);
    if (!childJob?.build) {
      continue;
    }

    returnTotal += getInstallCost(childJob);
    returnTotal += toFinite(childJob.build.costs?.extrasTotal);
    totalProduced += toFinite(childJob.build.products?.totalQuantity);

    for (const cMaterial of childJob.build.materials ?? []) {
      const nestedChildIds = childJob.build.childJobs?.[cMaterial.typeID];
      returnTotal += findItemBuildCost(
        cMaterial,
        nestedChildIds,
        findJobInJobArray,
        getInstallCost
      );
    }
  }

  if (totalProduced <= 0) {
    return toFinite(material.purchasedCost);
  }

  const perUnit = returnTotal / totalProduced;
  if (!Number.isFinite(perUnit)) {
    return toFinite(material.purchasedCost);
  }

  return toFinite(perUnit) * toFinite(material.quantity);
}
