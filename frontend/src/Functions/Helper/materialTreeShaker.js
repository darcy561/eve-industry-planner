/**
 * Optimizes job production quantities based on parent job requirements.
 * Iteratively recalculates job quantities to minimize overproduction while meeting requirements.
 * Uses a "tree shaking" approach to eliminate unnecessary production.
 * 
 * @param {Array} allJobObjects - Array of all job objects to optimize
 * @param {Function} recalculateJob - Function to recalculate a job's production quantities
 * @returns {Set<string>} Set of job IDs that were recalculated
 * 
 * @example
 * const recalculatedJobs = materialTreeShaker(jobArray, (job, requirements) => {
 *   job.recalculateProduction(requirements);
 * });
 * console.log(`Recalculated ${recalculatedJobs.size} jobs`);
 */
function materialTreeShaker(allJobObjects, recalculateJob) {
  if (!allJobObjects || !recalculateJob) {
    console.warn("Missing inputs for materialTreeShaker");
    return new Set();
  }

  let jobsRecalculated;
  const maxIterations = 100;
  let iterationCounter = 0;
  const recalculatedJobIds = new Set();

  do {
    jobsRecalculated = false;

    allJobObjects.forEach((job) => {
      let parentJobRequirements = getParentJobRequirements(job, allJobObjects);
      let needsRecalculation = shouldRecalculate(job, parentJobRequirements);

      if (needsRecalculation) {
        recalculateJob(job, parentJobRequirements);
        recalculatedJobIds.add(job.jobID);
        jobsRecalculated = true;
      }
    });
    iterationCounter++;
    if (iterationCounter > maxIterations) {
      break;
    }
  } while (jobsRecalculated);

  return recalculatedJobIds;
}

/**
 * Calculates the total material requirements from parent jobs for a given job.
 * 
 * @param {Object} job - The job to calculate requirements for
 * @param {Array} allJobs - Array of all job objects
 * @returns {number} Total quantity of materials needed from parent jobs
 * 
 * @private
 */
function getParentJobRequirements(job, allJobs) {
  if (!job.parentJob || !Array.isArray(job.parentJob)) {
    return 0;
  }

  return job.parentJob.reduce((total, parentJobID) => {
    const parentJob = allJobs.find(({ jobID }) => jobID === parentJobID);
    if (parentJob && parentJob.build && parentJob.build.materials) {
      const material = parentJob.build.materials.find(
        ({ typeID }) => typeID === job.itemID
      );
      if (material) {
        return total + (material.quantity || 0);
      }
    }
    return total;
  }, 0);
}

/**
 * Determines if a job needs recalculation based on production vs requirements.
 * 
 * @param {Object} job - The job to check
 * @param {number} parentJobRequirements - Total requirements from parent jobs
 * @returns {boolean} True if the job needs recalculation
 * 
 * @private
 */
const shouldRecalculate = (job, parentJobRequirements) => {
  if (!job.itemsProducedPerRun || job.itemsProducedPerRun === 0) {
    return false;
  }

  const neededRuns = Math.ceil(parentJobRequirements / job.itemsProducedPerRun);
  const minBuildQuantity = neededRuns * job.itemsProducedPerRun;

  const { totalQuantity: currentProduction } = job.build.products;

  const isOverproducing =
    currentProduction > minBuildQuantity + job.itemsProducedPerRun;
  const isUnderproducing = currentProduction < minBuildQuantity;
  const isItemAParent = job.parentJob.length === 0;

  return isUnderproducing || (isOverproducing && !isItemAParent);
};

export default materialTreeShaker;
