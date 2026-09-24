import { totalInstallCost } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";

import useUsersStore from "../../Zustand/usersStore.js";
import { getJobInstallCostForPlanning } from "../Installation Costs/installCosts.js";
import coerceFiniteNumber from "../Helper/coerceFiniteNumber";
import { jobCostPerUnit } from "./childJobCostWalk.js";

/**
 * What a job has cost per unit it produces, counting only what has actually
 * been spent against it.
 *
 * A material nothing has been paid for contributes nothing, rather than a
 * market figure: this answers what the build has cost so far, so a guess in it
 * would read as money spent. Its counterpart, `estimatedMaterialCost`, is the
 * one that prices the unbought from the market.
 *
 * @param {import("../../Classes/job").default} outputJob
 * @param {{ installCostMode?: "actual" | "planning" }} [options]
 * @returns {number}
 */
export function jobCostSoFar(outputJob, options = {}) {
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;

  return jobCostPerUnit(outputJob, {
    findJob: findJobInJobArray,
    buyCost: (material) => coerceFiniteNumber(material.purchasedCost),
    installCost:
      options.installCostMode === "actual"
        ? totalInstallCost
        : getJobInstallCostForPlanning,
  });
}
