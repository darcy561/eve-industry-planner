/**
 * The walk down a job's linked child jobs, shared by the two costs the planner
 * quotes from it.
 *
 * Both descend the same child jobs and both divide a job's cost by what it
 * produces. They differ in one rule: what a material that no child job builds
 * costs to buy. An estimate prices it at the market; a cost so far counts only
 * what was actually paid for it. That rule is the `buyCost` the caller passes,
 * and it is the only thing the two disagree about — everything the walk itself
 * does is deliberately identical, so the two figures stay comparable.
 *
 * The walk costs one visit per path rather than per job, so a job reachable more
 * than one way is walked more than once. Measured against the live data that is
 * not worth removing: the largest chain there is 118 jobs over 986 visits, and
 * the whole walk took well under a millisecond when a visit read a stored
 * install figure. A visit now works that figure out from the setup's materials,
 * and the walk has not been timed since. Caching a job's cost, or folding
 * bottom-up instead, are the levers if it ever matters.
 */

import { captureException } from "@sentry/react";

import {
  totalExtrasCost,
  totalQuantityProduced,
} from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import coerceFiniteNumber from "../Helper/coerceFiniteNumber";

/**
 * @typedef {object} CostRules
 * @property {(jobID: string) => object|null|undefined} findJob - The job a child id names
 * @property {(material: object) => number} buyCost - What a material no child job builds costs to buy
 * @property {(job: object) => number} installCost - What running a job costs
 */

/**
 * What one material of a job contributes to that job's cost.
 *
 * @param {object} material
 * @param {unknown} childJobIDs - The child jobs building this material, if any
 * @param {CostRules} rules
 * @param {Set<string>} ancestry - Job ids already being walked on this path
 * @returns {number}
 */
export function materialCostThroughChildJobs(
  material,
  childJobIDs,
  rules,
  ancestry,
) {
  const childIDs = Array.isArray(childJobIDs) ? childJobIDs : [];

  if (material.purchaseComplete) {
    return coerceFiniteNumber(material.purchasedCost);
  }
  if (childIDs.length === 0) {
    return rules.buyCost(material);
  }

  let cost = 0;
  let produced = 0;

  for (const childJobID of childIDs) {
    // Skipping costs the branch nothing, so a material whose only child cycles
    // is bought below rather than given a part-counted figure. The
    // displayed cost is understated with no on-screen sign of it, which is why
    // the skip is reported.
    if (ancestry.has(childJobID)) {
      reportChildJobCycle(childJobID, ancestry);
      continue;
    }

    const childJob = rules.findJob(childJobID);
    if (!childJob?.build) continue;

    cost += rules.installCost(childJob) + totalExtrasCost(childJob);
    produced += coerceFiniteNumber(totalQuantityProduced(childJob));

    // Ancestry is per path, not per walk: the same job reached down two separate
    // branches is two real contributions and must still be counted twice.
    const branchAncestry = new Set(ancestry).add(childJobID);

    for (const childMaterial of Object.values(childJob.build.materials ?? {})) {
      cost += materialCostThroughChildJobs(
        childMaterial,
        childJob.build.childJobs?.[childMaterial.typeID],
        rules,
        branchAncestry,
      );
    }
  }

  // Several children of one material are spread over their combined output
  // rather than charged one after another, because they are parallel ways of
  // producing the same thing rather than separate costs.
  if (produced <= 0) {
    return rules.buyCost(material);
  }
  const perUnit = cost / produced;
  if (!Number.isFinite(perUnit)) {
    return rules.buyCost(material);
  }

  return perUnit * coerceFiniteNumber(material.quantity);
}

/**
 * What a job costs per unit it produces, walking its children for every
 * material one of them builds.
 *
 * @param {object} job
 * @param {CostRules} rules
 * @returns {number}
 */
export function jobCostPerUnit(job, rules) {
  if (!job?.build) return 0;

  const produced = coerceFiniteNumber(totalQuantityProduced(job));
  if (produced <= 0) return 0;

  // The job being costed opens the walk's ancestry so a job listing itself as
  // its own child is caught on the first descent rather than the second.
  const ancestry = job.jobID ? new Set([job.jobID]) : new Set();

  let cost = rules.installCost(job) + totalExtrasCost(job);
  for (const material of Object.values(job.build.materials ?? {})) {
    cost += materialCostThroughChildJobs(
      material,
      job.build.childJobs?.[material.typeID],
      rules,
      ancestry,
    );
  }

  return coerceFiniteNumber(cost) / produced;
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
