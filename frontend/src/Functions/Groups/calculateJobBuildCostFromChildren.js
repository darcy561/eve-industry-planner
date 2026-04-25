import useUsersStore from "../../Zustand/usersStore.js";

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
 */
export function calculateCurrentJobBuildCostFromChildren(outputJob) {
  if (!outputJob?.build) {
    return 0;
  }

  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;
  const products = outputJob.build.products;
  const outTotalQty = toFinite(products?.totalQuantity);
  if (outTotalQty <= 0) {
    return 0;
  }

  const costs = outputJob.build.costs;
  let finalBuildCost = toFinite(costs?.installCosts) + toFinite(costs?.extrasTotal);

  for (const material of outputJob.build.materials ?? []) {
    const childJobs = outputJob.build.childJobs?.[material.typeID];
    finalBuildCost += findItemBuildCost(material, childJobs, findJobInJobArray);
  }

  return toFinite(finalBuildCost) / outTotalQty;
}

/**
 * @param {*} material
 * @param {unknown} inputChildJobs
 * @param {(id: string) => import("../../Classes/job").default | null | undefined} findJobInJobArray
 */
function findItemBuildCost(material, inputChildJobs, findJobInJobArray) {
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

    returnTotal += toFinite(childJob.build.costs?.installCosts);
    returnTotal += toFinite(childJob.build.costs?.extrasTotal);
    totalProduced += toFinite(childJob.build.products?.totalQuantity);

    for (const cMaterial of childJob.build.materials ?? []) {
      const nestedChildIds = childJob.build.childJobs?.[cMaterial.typeID];
      returnTotal += findItemBuildCost(
        cMaterial,
        nestedChildIds,
        findJobInJobArray
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
