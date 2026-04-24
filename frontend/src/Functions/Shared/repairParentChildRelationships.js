import useUsersStore from "../../Zustand/usersStore";

/**
 * Repairs missing or broken parent-child relationships in a job.
 * Validates parent and child job relationships and removes invalid ones.
 * 
 * @param {Object} inputJob - Job object to repair relationships for
 * @param {Array<Object>} tempJobs - In-flight job objects created/updated in this flow
 * @returns {Set<string>} Set of modified job IDs
 * 
 * @throws {Error} Throws error if inputJob or tempJobs is missing
 * 
 * @example
 * const modifiedJobs = repairMissingParentChildRelationships(job, []);
 * console.log(`Repaired ${modifiedJobs.size} jobs`);
 */
function repairMissingParentChildRelationships(
  inputJob,
  tempJobs
) {
  try {
    if (!inputJob || !tempJobs) {
      throw new Error("Missing Inputs");
    }
    const modifiedJobIDs = new Set();
    const parentIDsToRemove = new Set();
    const jobLookup = buildJobLookup(inputJob, tempJobs);

    for (let parentID of inputJob.parentJobs) {
      try {
        const isParentIDValid = processParentID(
          parentID,
          inputJob,
          jobLookup,
          modifiedJobIDs
        );

        if (!isParentIDValid) {
          parentIDsToRemove.add(parentID);
        }
        inputJob.removeParentJob(parentIDsToRemove);
      } catch (err) {
        console.error(`Error processing parentID ${parentID}:`, err.message);
        parentIDsToRemove.add(parentID);
      }
    }

    for (let material of inputJob.build.materials) {
      const childJobsToRemove = new Set();

      for (let childJobID of inputJob.build.childJobs[material.typeID]) {
        const isChildValid = processChildID(
          childJobID,
          material,
          inputJob.jobID,
          jobLookup,
          modifiedJobIDs
        );

        if (!isChildValid) {
          childJobsToRemove.add(childJobID);
        }
      }
      inputJob.removeChildJob(material.typeID, childJobsToRemove);
    }

    return modifiedJobIDs;
  } catch (err) {
    console.error(err);
  }
}

export default repairMissingParentChildRelationships;

/**
 * Processes a parent job ID and validates the relationship.
 * 
 * @param {string} parentID - Parent job ID to process
 * @param {Object} inputJob - Input job object
 * @param {Map<string, Object>} jobLookup - Map of jobs keyed by jobID
 * @param {Set<string>} modifiedJobsSet - Set to track modified job IDs
 * @returns {boolean} True when parent relationship is valid
 * 
 * @private
 */
function processParentID(
  parentID,
  inputJob,
  jobLookup,
  modifiedJobsSet
) {
  const matchedJob = jobLookup.get(parentID);
  if (!matchedJob) return false;

  const parentMaterial = matchedJob.build.materials.find(
    (mat) => mat.typeID === inputJob.itemID
  );

  if (!parentMaterial) {
    matchedJob.build.materials.forEach((material) => {
      if (
        matchedJob.build.childJobs[material.typeID].includes(inputJob.jobID)
      ) {
        matchedJob.removeChildJob(material.typeID, inputJob.typeID);
      }
    });

    return false;
  }

  const childJobLocation = matchedJob.build.childJobs[parentMaterial.typeID];

  if (!childJobLocation.includes(inputJob.jobID)) {
    matchedJob.addChildJob(parentMaterial.typeID, inputJob.jobID);
    modifiedJobsSet.add(parentID);
  }

  return true;
}

/**
 * Processes a child job ID and validates the relationship.
 * 
 * @param {string} childID - Child job ID to process
 * @param {Object} material - Material object
 * @param {string} inputJobID - Input job ID
 * @param {Map<string, Object>} jobLookup - Map of jobs keyed by jobID
 * @param {Set<string>} modifiedJobsSet - Set to track modified job IDs
 * @returns {boolean} True when child relationship is valid
 * 
 * @private
 */
function processChildID(
  childID,
  material,
  inputJobID,
  jobLookup,
  modifiedJobsSet
) {
  const matchedJob = jobLookup.get(childID);

  if (!matchedJob) {
    return false;
  }

  if (matchedJob.itemID !== material.typeID) {
    matchedJob.removeParentJob(inputJobID);
    return false;
  }

  if (!matchedJob.parentJobs.includes(inputJobID)) {
    matchedJob.addParentJob(inputJobID);
    modifiedJobsSet.add(childID);
  }

  return true;
}

/**
 * Builds an in-memory lookup from current jobArray plus in-flight jobs.
 *
 * @param {Object} inputJob
 * @param {Array} tempJobs
 * @returns {Map<string, Object>}
 */
function buildJobLookup(inputJob, tempJobs) {
  const jobLookup = new Map();
  const stateJobs = useUsersStore.getState().jobData.jobArray ?? [];

  for (const job of stateJobs) {
    if (job?.jobID) jobLookup.set(job.jobID, job);
  }
  for (const job of tempJobs ?? []) {
    if (job?.jobID) jobLookup.set(job.jobID, job);
  }
  if (inputJob?.jobID) {
    jobLookup.set(inputJob.jobID, inputJob);
  }

  return jobLookup;
}
