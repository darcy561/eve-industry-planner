import { totalInstallCost } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import { purchasedCost } from "../../Components/Edit Job/Edit Job Hooks/materialSelectors";

import useUsersStore from "../../Zustand/usersStore.js";
import { getJobInstallCostForPlanning } from "../Installation Costs/installCosts.js";
import coerceFiniteNumber from "../Helper/coerceFiniteNumber";
import { jobCostPerUnit } from "./childJobCostWalk.js";

/**
 * What a job has cost per unit it produces, counting only what has actually
 * been spent against it.
 *
 * @param {object} outputJob
 * @param {{ installCostMode?: "actual" | "planning" }} [options]
 * @returns {number}
 */
export function jobCostSoFar(outputJob, options = {}) {
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;

  return jobCostPerUnit(outputJob, {
    findJob: findJobInJobArray,
    buyCost: (material, need) =>
      coerceFiniteNumber(purchasedCost(material, need)),
    installCost:
      options.installCostMode === "actual"
        ? totalInstallCost
        : getJobInstallCostForPlanning,
  });
}
