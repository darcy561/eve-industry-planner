import { captureException } from "@sentry/react";

import {
  materialRequirementOf,
  totalExtrasCost,
  totalQuantityProduced,
} from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";
import {
  purchaseComplete,
  purchasedCost,
} from "../../Components/Edit Job/Edit Job Hooks/materialSelectors";
import coerceFiniteNumber from "../Helper/coerceFiniteNumber";

/**
 * @typedef {object} CostRules
 * @property {(jobID: string) => object|null|undefined} findJob - The job a child id names
 * @property {(material: object, requirement: number) => number} buyCost - What a material no child job builds costs to buy
 * @property {(job: object) => number} installCost - What running a job costs
 */

/**
 * What one material of a job contributes to that job's cost, spreading several
 * children over their combined output and skipping one already on this path.
 *
 * @param {object} material
 * @param {number} requirement - How many of it the owning job's setups call for
 * @param {unknown} childJobIDs - The child jobs building this material, if any
 * @param {CostRules} rules
 * @param {Set<string>} ancestry - Job ids already being walked on this path
 * @returns {number}
 */
export function materialCostThroughChildJobs(
  material,
  requirement,
  childJobIDs,
  rules,
  ancestry,
) {
  const childIDs = Array.isArray(childJobIDs) ? childJobIDs : [];

  if (purchaseComplete(material, requirement)) {
    return coerceFiniteNumber(purchasedCost(material, requirement));
  }
  if (childIDs.length === 0) {
    return rules.buyCost(material, requirement);
  }

  let cost = 0;
  let produced = 0;

  for (const childJobID of childIDs) {
    if (ancestry.has(childJobID)) {
      reportChildJobCycle(childJobID, ancestry);
      continue;
    }

    const childJob = rules.findJob(childJobID);
    if (!childJob?.build) continue;

    cost += rules.installCost(childJob) + totalExtrasCost(childJob);
    produced += coerceFiniteNumber(totalQuantityProduced(childJob));

    const branchAncestry = new Set(ancestry).add(childJobID);

    for (const childMaterial of Object.values(childJob.build.materials ?? {})) {
      cost += materialCostThroughChildJobs(
        childMaterial,
        materialRequirementOf(childJob.build.setup, childMaterial.typeID),
        childJob.build.childJobs?.[childMaterial.typeID],
        rules,
        branchAncestry,
      );
    }
  }

  if (produced <= 0) {
    return rules.buyCost(material, requirement);
  }
  const perUnit = cost / produced;
  if (!Number.isFinite(perUnit)) {
    return rules.buyCost(material, requirement);
  }

  return perUnit * coerceFiniteNumber(requirement);
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

  const ancestry = job.jobID ? new Set([job.jobID]) : new Set();

  let cost = rules.installCost(job) + totalExtrasCost(job);
  for (const material of Object.values(job.build.materials ?? {})) {
    cost += materialCostThroughChildJobs(
      material,
      materialRequirementOf(job.build.setup, material.typeID),
      job.build.childJobs?.[material.typeID],
      rules,
      ancestry,
    );
  }

  return coerceFiniteNumber(cost) / produced;
}

/**
 * Cycles already reported this session, so a card re-rendering does not send
 * the same one again.
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
