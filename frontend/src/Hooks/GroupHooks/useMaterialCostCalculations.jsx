import useUsersStore from "../../Zustand/usersStore"

/**
 * Custom hook that provides material cost calculation functionality for EVE Online industry jobs.
 * 
 * This hook handles complex material cost calculations:
 * - Calculates costs from child jobs recursively
 * - Handles purchase completion status
 * - Supports alternative job locations and price sources
 * - Manages market data integration
 * - Calculates per-unit job costs
 * - Handles install costs and extra costs
 * 
 * The cost calculation process:
 * 1. Checks if material purchase is complete (uses purchased cost)
 * 2. If child jobs exist, calculates cost from child job production
 * 3. Otherwise uses market price for the material
 * 4. Recursively calculates child job costs including materials
 * 5. Includes install costs and extra costs in calculations
 * 6. Returns per-unit cost for accurate pricing
 * 
 * @returns {Object} Object containing cost calculation functions
 * @returns {Function} returns.calculateMaterialCostFromChildJobs - Calculates material cost from child jobs
 * 
 * @example
 * function CostCalculator() {
 *   const { calculateMaterialCostFromChildJobs } = useMaterialCostCalculations();
 * 
 *   const handleCalculateCost = (material, childJobs, altJobs, altPrices, market, orderType) => {
 *     const cost = calculateMaterialCostFromChildJobs(
 *       material, childJobs, altJobs, altPrices, market, orderType
 *     );
 *     console.log("Material cost:", cost);
 *   };
 * 
 *   return <div>Cost calculation interface</div>;
 * }
 */
export function useMaterialCostCalculations() {
  const { jobArray } = useUsersStore((state) => state.jobData);

  function calculateMaterialCostFromChildJobs(
    inputMaterial,
    childJobs,
    alternativeJobLocation = [],
    alternativePriceLocation,
    defaultMarketLocation,
    defaultOrderType
  ) {
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
        const materialPrice = getMaterialPrice(material);
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
          jobCost += materialPrice * material.quantity;
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

  return {
    calculateMaterialCostFromChildJobs,
  };
}
