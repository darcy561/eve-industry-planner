/**
 * Parent-Child Job Changes Application for EVE Industry Planner.
 * 
 * Applies parent-child job relationship changes to job objects, handling
 * the complex logic of updating both parent and child job relationships
 * while maintaining data integrity and tracking modified jobs.
 * 
 * @fileoverview Function for applying parent-child job relationship changes
 * @author EVE Industry Planner Team
 */

import findOrGetJobObject from "../../../Functions/Helper/findJobObject";

/**
 * Applies parent-child job relationship changes to job objects.
 * 
 * Processes both parent job additions/removals and child job additions/removals,
 * updating the relevant job objects and maintaining relationship integrity.
 * Returns a set of all job IDs that were modified during the process.
 * 
 * @param {Object} parentChildObject - Object containing parent-child changes
 * @param {Object} parentChildObject.parentJobs - Parent job changes
 * @param {Array} parentChildObject.parentJobs.add - Parent job IDs to add
 * @param {Array} parentChildObject.parentJobs.remove - Parent job IDs to remove
 * @param {Object} parentChildObject.childJobs - Child job changes by material type
 * @param {Object} inputJob - The job being edited
 * @param {Array} retrievedJobs - Array of retrieved job objects
 * @returns {Promise<Set>} Set of modified job IDs
 * 
 * @example
 * const changes = {
 *   parentJobs: {
 *     add: ['parent-job-1', 'parent-job-2'],
 *     remove: ['parent-job-3']
 *   },
 *   childJobs: {
 *     34: { add: ['child-job-1'], remove: ['child-job-2'] }
 *   }
 * };
 * 
 * const modifiedJobs = await applyParentChildChanges(changes, inputJob, retrievedJobs);
 * console.log('Modified jobs:', Array.from(modifiedJobs));
 */
async function applyParentChildChanges(
  parentChildObject,
  inputJob,
  retrievedJobs
) {
  try {
    if (!parentChildObject || !retrievedJobs) {
      throw new Error("Missing input items");
    }

    const modifiedJobIDs = new Set();

    await processParentJobs(
      parentChildObject,
      inputJob,
      retrievedJobs,
      modifiedJobIDs
    );
    await processChildJobs(
      parentChildObject,
      inputJob,
      retrievedJobs,
      modifiedJobIDs
    );

    return modifiedJobIDs;
  } catch (err) {
    console.error("Error apply parent child changes to jobs:", err);
    return new Set();
  }
}
export default applyParentChildChanges;

/**
 * Processes parent job relationship changes.
 * 
 * Handles the removal and addition of parent jobs to the input job,
 * updating both the input job and the parent job objects. Tracks
 * all modified job IDs for later processing.
 * 
 * @param {Object} parentChildObject - Object containing parent job changes
 * @param {Object} inputJob - The job being edited
 * @param {Array} retrievedJobs - Array of retrieved job objects
 * @param {Set} modifiedJobIDs - Set to track modified job IDs
 * @returns {Promise<void>}
 * 
 * @example
 * await processParentJobs(parentChildObject, inputJob, retrievedJobs, modifiedJobIDs);
 */
async function processParentJobs(
  parentChildObject,
  inputJob,
  retrievedJobs,
  modifiedJobIDs
) {
  try {
    for (let parentID of parentChildObject.parentJobs.remove) {
      const matchingJob = await findOrGetJobObject(
        parentID,
        retrievedJobs
      );
      if (!matchingJob) continue;

      matchingJob.removeChildJob(inputJob.itemID, inputJob.jobID);
      modifiedJobIDs.add(parentID);
    }

    inputJob.removeParentJob(parentChildObject.parentJobs.remove);

    const unmatchedParentIDS = new Set();

    for (let parentID of parentChildObject.parentJobs.add) {
      const matchingJob = await findOrGetJobObject(
        parentID,
        retrievedJobs
      );
      if (!matchingJob) {
        unmatchedParentIDS.add(parentID);
        continue;
      }

      matchingJob.addChildJob(inputJob.itemID, inputJob.jobID);
      modifiedJobIDs.add(parentID);
    }

    inputJob.addParentJob(
      parentChildObject.parentJobs.add.filter(
        (id) => !unmatchedParentIDS.has(id)
      )
    );
  } catch (err) {
    throw new Error(`Error updating parent jobs: ${err.message}`);
  }
}

/**
 * Processes child job relationship changes.
 * 
 * Handles the addition and removal of child jobs for each material type
 * in the input job, updating both the input job and the child job objects.
 * Tracks all modified job IDs for later processing.
 * 
 * @param {Object} parentChildObject - Object containing child job changes
 * @param {Object} inputJob - The job being edited
 * @param {Array} retrievedJobs - Array of retrieved job objects
 * @param {Set} modifiedJobIDs - Set to track modified job IDs
 * @returns {Promise<void>}
 * 
 * @example
 * await processChildJobs(parentChildObject, inputJob, retrievedJobs, modifiedJobIDs);
 */
async function processChildJobs(
  parentChildObject,
  inputJob,
  retrievedJobs,
  modifiedJobIDs
) {
  try {
    for (let material of inputJob.build.materials) {
      const unMatchedChildIDs = new Set();
      const matchedMaterial = parentChildObject.childJobs[material.typeID];

      if (!matchedMaterial) continue;

      for (let childID of matchedMaterial.add) {
        const matchedJob = await findOrGetJobObject(
          childID,
          retrievedJobs
        );

        if (!matchedJob) {
          unMatchedChildIDs.add(childID);
          continue;
        }

        matchedJob.addParentJob(inputJob.jobID);
        modifiedJobIDs.add(childID);
      }

      for (let childID of matchedMaterial.remove) {
        const matchedJob = await findOrGetJobObject(
          childID,
          retrievedJobs
        );

        if (!matchedJob) {
          unMatchedChildIDs.add(childID);
          continue;
        }

        matchedJob.removeParentJob(inputJob.jobID);
        modifiedJobIDs.add(childID);
      }
      inputJob.addChildJob(
        material.typeID,
        matchedMaterial.add.filter((id) => !unMatchedChildIDs.has(id))
      );
      inputJob.removeChildJob(material.typeID, unMatchedChildIDs);
    }
  } catch (err) {
    throw new Error(`Error updating child jobs: ${err.message}`);
  }
}
