import useUsersStore from "../../Zustand/usersStore.js";

/**
 * Material cost from child jobs (recursive). Uses `jobData.jobArray` from Zustand.
 *
 * @param {*} inputMaterial
 * @param {string[]} childJobs
 * @param {unknown} [alternativeJobLocation]
 * @param {*} alternativePriceLocation
 * @param {*} defaultMarketLocation
 * @param {*} defaultOrderType
 */
export function calculateMaterialCostFromChildJobs(
  inputMaterial,
  childJobs,
  alternativeJobLocation = [],
  alternativePriceLocation,
  defaultMarketLocation,
  defaultOrderType
) {
  const jobArray = useUsersStore.getState().jobData.jobArray || [];
  if (!Array.isArray(alternativeJobLocation)) {
    alternativeJobLocation = [alternativeJobLocation];
  }

  const availableJobSelection = [...jobArray, ...alternativeJobLocation];

  const materialPrice = getMaterialPrice(inputMaterial);

  if (inputMaterial.purchaseComplete) {
    return inputMaterial.purchasedCost;
  }
  if (childJobs.length > 0) {
    let jobCost = 0;
    for (let childJobID of childJobs) {
      const matchedJob = availableJobSelection.find(
        (i) => i.jobID === childJobID
      );
      if (!matchedJob) continue;

      jobCost += jobCostCalculation(matchedJob) * inputMaterial.quantity;
    }

    return jobCost;
  }

  return materialPrice * inputMaterial.quantity;

  function jobCostCalculation(inputJob) {
    let jobCost = inputJob.build.costs.extrasTotal;

    if (!inputJob.build.costs.installCosts) {
      jobCost += Object.values(inputJob.build.setup).reduce(
        (prev, { estimatedInstallCost }) => {
          return (prev += estimatedInstallCost);
        },
        0
      );
    } else {
      jobCost += inputJob.build.costs.installCosts;
    }
    for (let material of inputJob.build.materials) {
      const childJobLocation = inputJob.build.childJobs[material.typeID];
      const materialPriceInner = getMaterialPrice(material);
      if (material.purchaseComplete) {
        jobCost += material.purchasedCost;
      } else if (childJobLocation.length > 0) {
        for (let childJobID of childJobLocation) {
          const matchedJob = availableJobSelection.find(
            (i) => i.jobID === childJobID
          );
          if (!matchedJob) continue;

          jobCost += jobCostCalculation(matchedJob) * material.quantity;
        }
      } else {
        jobCost += materialPriceInner * material.quantity;
      }
    }
    return jobCost / inputJob.build.products.totalQuantity;
  }

  function getMaterialPrice(materialObject) {
    return (
      useUsersStore
        .getState()
        .worldData.actions.findMarketData(materialObject.typeID, alternativePriceLocation)?.[
        defaultMarketLocation
      ]?.[defaultOrderType] || materialObject.purchasedCost
    );
  }
}
