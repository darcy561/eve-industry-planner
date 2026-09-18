import { captureException } from "@sentry/react";

import useUsersStore from "../../Zustand/usersStore.js";
import { getJobInstallCostForPlanning } from "../Installation Costs/installCosts.js";

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
 * The walk costs one visit per path rather than per job, so a job reachable more
 * than one way is walked more than once. Measured against the live data that is
 * not worth removing: the largest chain there is 118 jobs over 986 visits, and
 * the whole walk took well under a millisecond when a visit read a stored
 * install figure. A visit now works that figure out from the setup's materials,
 * and the walk has not been timed since. Caching a job's cost, or folding
 * bottom-up instead, are the levers if it ever matters.
 *
 * @param {import("../../Classes/job").default} outputJob
 * @param {{ installCostMode?: "actual" | "planning" }} [options]
 *     (group output)
 *     then (edit job material pricing)
 */
export function calculateCurrentJobBuildCostFromChildren(
  outputJob,
  options = {},
) {
  if (!outputJob?.build) {
    return 0;
  }

  const getInstallCost =
    options.installCostMode === "actual"
      ? (job) => job.totalInstallCost
      : getJobInstallCostForPlanning;

  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;
  const outTotalQty = toFinite(outputJob.totalQuantityProduced);
  if (outTotalQty <= 0) {
    return 0;
  }

  let finalBuildCost = getInstallCost(outputJob) + outputJob.totalExtrasCost;

  // The job being costed opens the walk's ancestry so a job listing itself as
  // its own child is caught on the first descent rather than the second.
  const ancestry = outputJob.jobID ? new Set([outputJob.jobID]) : new Set();

  for (const material of outputJob.build.materials ?? []) {
    const childJobs = outputJob.build.childJobs?.[material.typeID];
    finalBuildCost += findItemBuildCost(
      material,
      childJobs,
      findJobInJobArray,
      getInstallCost,
      ancestry,
    );
  }

  return toFinite(finalBuildCost) / outTotalQty;
}

/**
 * @param {*} material
 * @param {unknown} inputChildJobs
 * @param {(id: string) => import("../../Classes/job").default | null | undefined} findJobInJobArray
 * @param {(job: import("../../Classes/job").default) => number} getInstallCost
 * @param {Set<string>} ancestry - Job ids already being walked on this path
 */
function findItemBuildCost(
  material,
  inputChildJobs,
  findJobInJobArray,
  getInstallCost,
  ancestry,
) {
  const childIds = Array.isArray(inputChildJobs) ? inputChildJobs : [];

  if (material.purchaseComplete || childIds.length === 0) {
    return toFinite(material.purchasedCost);
  }

  let returnTotal = 0;
  let totalProduced = 0;

  for (const childJobID of childIds) {
    // Skipping costs the branch nothing, so a material whose only child cycles
    // falls to the purchased-cost fallback below rather than a part-counted
    // figure. The displayed cost is understated with no on-screen sign of it,
    // which is why the skip is reported.
    if (ancestry.has(childJobID)) {
      reportChildJobCycle(childJobID, ancestry);
      continue;
    }

    const childJob = findJobInJobArray(childJobID);
    if (!childJob?.build) {
      continue;
    }

    returnTotal += getInstallCost(childJob);
    returnTotal += childJob.totalExtrasCost;
    totalProduced += toFinite(childJob.totalQuantityProduced);

    // Ancestry is per path, not per walk: the same job reached down two separate
    // branches is two real contributions and must still be counted twice.
    const branchAncestry = new Set(ancestry).add(childJobID);

    for (const cMaterial of childJob.build.materials ?? []) {
      const nestedChildIds = childJob.build.childJobs?.[cMaterial.typeID];
      returnTotal += findItemBuildCost(
        cMaterial,
        nestedChildIds,
        findJobInJobArray,
        getInstallCost,
        branchAncestry,
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

/**
 * Cycles already reported this session, so one is not sent again.
 *
 * This runs inside a render rather than behind a user action, so a card showing
 * a cyclic job would otherwise report the same cycle on every re-render for as
 * long as it stays mounted. One id per distinct cycle is enough to find it.
 */
const reportedChildJobCycles = new Set();

/**
 * @param {string} childJobID
 * @param {Set<string>} ancestry
 */
function reportChildJobCycle(childJobID, ancestry) {
  const path = Array.from(ancestry);
  const key = `${childJobID}:${path.join(">")}`;
  if (reportedChildJobCycles.has(key)) return;
  reportedChildJobCycles.add(key);

  captureException(
    new Error("Child job cycle while costing a build; branch skipped"),
    {
      tags: { feature: "buildCost", errorType: "childJobCycle" },
      extra: { childJobID, ancestry: path },
    },
  );
}
