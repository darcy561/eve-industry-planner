import useUsersStore from "../../Zustand/usersStore.js";
import { getJobInstallCostForPlanning } from "../Installation Costs/installCosts.js";

/**
 * First matching job per ID (same as repeated `.find()` on a concatenated list).
 * @param {Array<{ jobID: unknown } | null | undefined>} jobs
 * @returns {Map<unknown, any>}
 */
function buildJobsByIdMap(jobs) {
  const map = new Map();
  for (const job of jobs) {
    if (job != null && job.jobID != null && !map.has(job.jobID)) {
      map.set(job.jobID, job);
    }
  }
  return map;
}

/** @param {{ jobsById: Map<unknown, any>, getMaterialPrice: (m: any) => number, visiting: Set<unknown> }} ctx */
function calculateJobUnitCost(inputJob, ctx) {
  const { jobsById, getMaterialPrice, visiting } = ctx;
  if (inputJob == null || !inputJob.build) {
    return 0;
  }

  const { jobID } = inputJob;
  if (jobID != null) {
    if (visiting.has(jobID)) {
      return 0;
    }
    visiting.add(jobID);
  }

  try {
    let jobCost = inputJob.totalExtrasCost();
    jobCost += getJobInstallCostForPlanning(inputJob);

    for (const material of inputJob.build.materials) {
      const childJobLocation = inputJob.build.childJobs[material.typeID];
      const materialPriceInner = getMaterialPrice(material);

      if (material.purchaseComplete) {
        jobCost += material.purchasedCost;
      } else if (Array.isArray(childJobLocation) && childJobLocation.length > 0) {
        for (const childJobID of childJobLocation) {
          const matchedJob = jobsById.get(childJobID);
          if (!matchedJob) continue;
          jobCost += calculateJobUnitCost(matchedJob, ctx) * material.quantity;
        }
      } else {
        jobCost += materialPriceInner * material.quantity;
      }
    }

    return jobCost / inputJob.totalQuantityProduced();
  } finally {
    if (jobID != null) {
      visiting.delete(jobID);
    }
  }
}

/**
 * Recursively prices materials using linked child job builds. Uses `jobData.jobArray` from Zustand.
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
  const altLocs = Array.isArray(alternativeJobLocation)
    ? alternativeJobLocation
    : [alternativeJobLocation];

  const availableJobSelection = [...jobArray, ...altLocs];
  const jobsById = buildJobsByIdMap(availableJobSelection);
  const visiting = new Set();

  const getMaterialPrice = (materialObject) =>
    useUsersStore
      .getState()
      .worldData.actions.findMarketData(
        materialObject.typeID,
        alternativePriceLocation
      )?.[defaultMarketLocation]?.[defaultOrderType] ||
    materialObject.purchasedCost;

  if (inputMaterial.purchaseComplete) {
    return inputMaterial.purchasedCost;
  }

  if (childJobs.length > 0) {
    let jobCost = 0;
    for (const childJobID of childJobs) {
      const matchedJob = jobsById.get(childJobID);
      if (!matchedJob) continue;
      jobCost +=
        calculateJobUnitCost(matchedJob, { jobsById, getMaterialPrice, visiting }) *
        inputMaterial.quantity;
    }
    return jobCost;
  }

  return getMaterialPrice(inputMaterial) * inputMaterial.quantity;
}
