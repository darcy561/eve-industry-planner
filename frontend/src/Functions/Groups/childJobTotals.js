import {
  materialRequirementOf,
  totalQuantityProduced,
} from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { estimatedMaterialCost } from "./estimatedMaterialCost.js";
import { getJobInstallCostForPlanning } from "../Installation Costs/installCosts.js";

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
        materialRequirementOf(childJob.build.setup, material.typeID),
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
    totalCostPerItem:
      quantityProduced !== 0
        ? (totalCostOfMaterials + totalInstallCosts) / quantityProduced
        : 0,
  };
}
