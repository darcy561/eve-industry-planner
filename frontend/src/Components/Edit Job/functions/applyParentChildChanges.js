import useUsersStore from "../../../Zustand/usersStore";
import {
  addChildJob,
  addParentJob,
  applyCommands,
  removeChildJob,
  removeParentJob,
} from "../Edit Job Hooks/jobCommands";

/**
 * Applies the parent and child link changes a reader asked for, answering which
 * jobs they moved.
 *
 * @param {Object} parentChildObject - Object containing parent-child changes
 * @param {Object} parentChildObject.parentJobs - Parent job changes
 * @param {Array} parentChildObject.parentJobs.add - Parent job IDs to add
 * @param {Array} parentChildObject.parentJobs.remove - Parent job IDs to remove
 * @param {Object} parentChildObject.childJobs - Child job changes by material type
 * @param {Object} inputJob - The job being edited
 * @param {Array} tempJobs - In-flight job objects created/updated in this flow
 * @returns {Set} Set of modified job IDs
 */
function applyParentChildChanges(parentChildObject, inputJob, tempJobs) {
  try {
    if (!parentChildObject || !tempJobs) {
      throw new Error("Missing input items");
    }

    const modifiedJobIDs = new Set();

    const jobLookup = buildJobLookup(inputJob, tempJobs);

    processParentJobs(parentChildObject, inputJob, jobLookup, modifiedJobIDs);
    processChildJobs(parentChildObject, inputJob, jobLookup, modifiedJobIDs);

    return modifiedJobIDs;
  } catch (err) {
    console.error("Error apply parent child changes to jobs:", err);
    return new Set();
  }
}
export default applyParentChildChanges;

/**
 * Adds and removes the job's parents, on both the job and each parent named.
 *
 * @param {Object} parentChildObject - Object containing parent job changes
 * @param {Object} inputJob - The job being edited
 * @param {Map<string, Object>} jobLookup - Map of jobs keyed by jobID
 * @param {Set} modifiedJobIDs - Set to track modified job IDs
 * @returns {void}
 */
function processParentJobs(
  parentChildObject,
  inputJob,
  jobLookup,
  modifiedJobIDs,
) {
  try {
    for (let parentID of parentChildObject.parentJobs.remove) {
      const matchingJob = jobLookup.get(parentID);
      if (!matchingJob) continue;

      applyCommands(
        matchingJob,
        removeChildJob(inputJob.itemID, inputJob.jobID),
      );
      modifiedJobIDs.add(parentID);
    }

    applyCommands(
      inputJob,
      removeParentJob(parentChildObject.parentJobs.remove),
    );

    const unmatchedParentIDS = new Set();

    for (let parentID of parentChildObject.parentJobs.add) {
      const matchingJob = jobLookup.get(parentID);
      if (!matchingJob) {
        unmatchedParentIDS.add(parentID);
        continue;
      }

      applyCommands(matchingJob, addChildJob(inputJob.itemID, inputJob.jobID));
      modifiedJobIDs.add(parentID);
    }

    applyCommands(
      inputJob,
      addParentJob(
        parentChildObject.parentJobs.add.filter(
          (id) => !unmatchedParentIDS.has(id),
        ),
      ),
    );
  } catch (err) {
    throw new Error(`Error updating parent jobs: ${err.message}`, {
      cause: err,
    });
  }
}

/**
 * Adds and removes each material's child jobs, on both the job and each child
 * named.
 *
 * @param {Object} parentChildObject - Object containing child job changes
 * @param {Object} inputJob - The job being edited
 * @param {Map<string, Object>} jobLookup - Map of jobs keyed by jobID
 * @param {Set} modifiedJobIDs - Set to track modified job IDs
 * @returns {void}
 */
function processChildJobs(
  parentChildObject,
  inputJob,
  jobLookup,
  modifiedJobIDs,
) {
  try {
    for (let material of Object.values(inputJob.build.materials)) {
      const unMatchedChildIDs = new Set();
      const matchedMaterial = parentChildObject.childJobs[material.typeID];

      if (!matchedMaterial) continue;

      for (let childID of matchedMaterial.add) {
        const matchedJob = jobLookup.get(childID);

        if (!matchedJob) {
          unMatchedChildIDs.add(childID);
          continue;
        }

        applyCommands(matchedJob, addParentJob(inputJob.jobID));
        modifiedJobIDs.add(childID);
      }

      for (let childID of matchedMaterial.remove) {
        const matchedJob = jobLookup.get(childID);

        if (!matchedJob) {
          unMatchedChildIDs.add(childID);
          continue;
        }

        applyCommands(matchedJob, removeParentJob(inputJob.jobID));
        modifiedJobIDs.add(childID);
      }
      applyCommands(
        inputJob,
        addChildJob(
          material.typeID,
          matchedMaterial.add.filter((id) => !unMatchedChildIDs.has(id)),
        ),
        removeChildJob(material.typeID, unMatchedChildIDs),
      );
    }
  } catch (err) {
    throw new Error(`Error updating child jobs: ${err.message}`, {
      cause: err,
    });
  }
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
