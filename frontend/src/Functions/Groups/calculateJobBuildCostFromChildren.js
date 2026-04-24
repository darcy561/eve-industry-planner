import useUsersStore from "../../Zustand/usersStore.js";

/**
 * @param {import("../../Classes/job").default} outputJob
 */
export function calculateCurrentJobBuildCostFromChildren(outputJob) {
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;

  let finalBuildCost = 0;

  finalBuildCost += outputJob.build.costs.installCosts;
  finalBuildCost += outputJob.build.costs.extrasTotal;
  for (const material of outputJob.build.materials) {
    const childJobs = outputJob.build.childJobs[material.typeID];
    finalBuildCost += findItemBuildCost(material, childJobs);
  }

  function findItemBuildCost(material, inputChildJobs) {
    if (material.purchaseComplete || inputChildJobs.length === 0) {
      return material.purchasedCost;
    }

    let returnTotal = 0;
    let totalProduced = 0;

    for (const childJobID of inputChildJobs) {
      const childJob = findJobInJobArray(childJobID);

      if (!childJob) {
        continue;
      }
      returnTotal += childJob.build.costs.installCosts;
      returnTotal += childJob.build.costs.extrasTotal;
      totalProduced += childJob.build.products.totalQuantity;
      for (const cMaterial of childJob.build.materials) {
        const cj = childJob.build.childJobs[cMaterial.typeID];
        returnTotal += findItemBuildCost(cMaterial, cj);
      }
    }
    return (returnTotal / totalProduced) * material.quantity;
  }
  return finalBuildCost / outputJob.build.products.totalQuantity;
}
