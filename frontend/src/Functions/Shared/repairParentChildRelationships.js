import findOrGetJobObject from "../Helper/findJobObject";

/**
 * Repairs missing or broken parent-child relationships in a job.
 * Validates parent and child job relationships and removes invalid ones.
 * 
 * @param {Object} inputJob - Job object to repair relationships for
 * @param {Array<Object>} retrievedJobs - Array to store retrieved jobs
 * @returns {Promise<Set<string>>} Promise that resolves to set of modified job IDs
 * 
 * @throws {Error} Throws error if inputJob or retrievedJobs is missing
 * 
 * @example
 * const modifiedJobs = await repairMissingParentChildRelationships(job, []);
 * console.log(`Repaired ${modifiedJobs.size} jobs`);
 */
async function repairMissingParentChildRelationships(
  inputJob,
  retrievedJobs
) {
  try {
    if (!inputJob || !retrievedJobs) {
      throw new Error("Missing Inputs");
    }
    const modifiedJobIDs = new Set();
    const parentIDsToRemove = new Set();

    for (let parentID of inputJob.parentJob) {
      try {
        const isParentIDValid = await processParentID(
          parentID,
          inputJob,
          retrievedJobs,
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
        const isChildValid = await processChildID(
          childJobID,
          material,
          inputJob.jobID,
          retrievedJobs,
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
 * @param {Array<Object>} retrievedJobs - Array to store retrieved jobs
 * @param {Set<string>} modifiedJobsSet - Set to track modified job IDs
 * @returns {Promise<boolean>} Promise that resolves to true if parent is valid
 * 
 * @private
 */
async function processParentID(
  parentID,
  inputJob,
  retrievedJobs,
  modifiedJobsSet
) {
  const matchedJob = await findOrGetJobObject(
    parentID,
    retrievedJobs
  );
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
 * @param {Array<Object>} retrievedJobs - Array to store retrieved jobs
 * @param {Set<string>} modifiedJobsSet - Set to track modified job IDs
 * @returns {Promise<boolean>} Promise that resolves to true if child is valid
 * 
 * @private
 */
async function processChildID(
  childID,
  material,
  inputJobID,
  retrievedJobs,
  modifiedJobsSet
) {
  const matchedJob = await findOrGetJobObject(childID, retrievedJobs);

  if (!matchedJob) {
    return false;
  }

  if (matchedJob.itemID !== material.typeID) {
    matchedJob.removeParentJob(inputJobID);
    return false;
  }

  if (!matchedJob.parentJob.includes(inputJobID)) {
    matchedJob.addParentJob(inputJobID);
    modifiedJobsSet.add(childID);
  }

  return true;
}
